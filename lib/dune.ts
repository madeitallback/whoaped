import { createDuneJob, listDuneJobs, updateScanJob, upsertDuneBuyers } from "@/lib/supabase";

type DuneExecution = { execution_id?: string; state?: string };
type DuneStatus = { state?: string; is_execution_finished?: boolean; error?: unknown };
type DuneResult = { result?: { rows?: Array<Record<string, unknown>> } };
const RESULTS_PAGE_SIZE = 1_000;
const MAX_RESULT_ROWS = 50_000;

const api = "https://api.dune.com/api/v1";

function configured() {
  return Boolean(process.env.DUNE_API_KEY && process.env.DUNE_BUYERS_QUERY_ID);
}

async function dune(path: string, init: RequestInit = {}) {
  const key = process.env.DUNE_API_KEY;
  if (!key) throw new Error("Dune is not configured.");
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: { "x-dune-api-key": key, "content-type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Dune ${response.status}: ${await response.text()}`);
  return response;
}

async function startQuery(queryId: string, parameters: Record<string, string>) {
  const response = await dune(`/query/${queryId}/execute`, {
    method: "POST",
    // Let Dune select the account's available default tier. Some plans do not
    // expose the named `small` tier even though they can run saved queries.
    body: JSON.stringify({ query_parameters: parameters }),
  });
  return await response.json() as DuneExecution;
}

/** Dune's results endpoint is paginated. Import every page up to a deliberate
 * safety ceiling rather than silently treating the first 1,000 rows as a full
 * buyer history. The ceiling is surfaced as a failed job, not fake completion. */
async function fetchAllResults(executionId: string) {
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < MAX_RESULT_ROWS; offset += RESULTS_PAGE_SIZE) {
    const response = await dune(`/execution/${executionId}/results?limit=${RESULTS_PAGE_SIZE}&offset=${offset}`);
    const page = await response.json() as DuneResult;
    const batch = page.result?.rows || [];
    rows.push(...batch);
    if (batch.length < RESULTS_PAGE_SIZE) return rows;
  }
  throw new Error(`Dune result exceeded the ${MAX_RESULT_ROWS.toLocaleString()}-row safety limit.`);
}

/** Starts one saved Dune buyer query per mint; an existing job is never duplicated. */
export async function enqueueDuneBuyerIndex(mint: string, creator: string | null) {
  if (!configured()) return false;
  const existing = await listDuneJobs(mint);
  if (existing.some(job => job.job_type === "historical_buyers" && job.status !== "failed")) return false;
  const queryId = process.env.DUNE_BUYERS_QUERY_ID!;
  const job = await createDuneJob(mint, "historical_buyers", {
    query_id: queryId,
    parameters: { mint, start_date: "2024-01-01 00:00:00", ...(creator ? { creator } : {}) },
  });
  if (!job) return false;
  try {
    const execution = await startQuery(queryId, { mint, start_date: "2024-01-01 00:00:00" });
    if (!execution.execution_id) throw new Error("Dune did not return an execution id.");
    await updateScanJob(job.id, { status: "running", provider_execution_id: execution.execution_id });
    return true;
  } catch (error) {
    await updateScanJob(job.id, { status: "failed", error: error instanceof Error ? error.message : "Dune query could not start" });
    return false;
  }
}

/** Polls existing executions during a later scan and imports completed buyer rows. */
export async function advanceDuneJobs(mint: string) {
  if (!configured()) return false;
  const jobs = await listDuneJobs(mint, ["running"]);
  let changed = false;
  for (const job of jobs) {
    if (!job.provider_execution_id) continue;
    try {
      const statusResponse = await dune(`/execution/${job.provider_execution_id}/status`);
      const status = await statusResponse.json() as DuneStatus;
      if (!status.is_execution_finished && status.state !== "QUERY_STATE_COMPLETED" && status.state !== "QUERY_STATE_FAILED") continue;
      if (status.state !== "QUERY_STATE_COMPLETED") {
        await updateScanJob(job.id, { status: "failed", error: JSON.stringify(status.error || status.state) });
        changed = true;
        continue;
      }
      const rows = await fetchAllResults(job.provider_execution_id);
      if (job.job_type === "historical_buyers") await upsertDuneBuyers(mint, rows);
      await updateScanJob(job.id, { status: "completed", result: { rows: rows.length } });
      changed = true;
    } catch (error) {
      await updateScanJob(job.id, { status: "failed", error: error instanceof Error ? error.message : "Dune polling failed" });
      changed = true;
    }
  }
  return changed;
}

export async function duneIndexState(mint: string) {
  const jobs = await listDuneJobs(mint);
  const buyerJob = [...jobs].reverse().find(job => job.job_type === "historical_buyers");
  return buyerJob?.status || "not_started";
}
