import { resolveFomo } from "@/lib/fomo";
import { createHeliusJob, listHeliusJobs, loadCurrentHolderPage, updateScanJob, upsertVerifiedFomoLabels } from "@/lib/supabase";

export type LabelIndexProgress = { state: string; checked: number; matched: number };

const pageSize = 50;

export async function enqueueLabelIndex(mint: string) {
  const jobs = await listHeliusJobs(mint);
  if (jobs.some(job => job.job_type === "label_enrichment" && (job.status === "queued" || job.status === "running"))) return false;
  const completed = [...jobs].reverse().find(job => job.job_type === "label_enrichment" && job.status === "completed");
  if (completed) return false;
  return Boolean(await createHeliusJob(mint, "label_enrichment", { cursor: null, checked: 0, matched: 0 }));
}

export async function advanceLabelJobs(mint: string) {
  const job = [...await listHeliusJobs(mint, ["queued", "running"])].reverse().find(item => item.job_type === "label_enrichment");
  if (!job) return false;
  const cursor = typeof job.payload?.cursor === "string" ? job.payload.cursor : null;
  const checked = Number(job.payload?.checked || 0);
  const matched = Number(job.payload?.matched || 0);
  try {
    await updateScanJob(job.id, { status: "running" });
    const page = await loadCurrentHolderPage(mint, cursor, pageSize);
    const hits = await resolveFomo(page.map(holder => holder.owner));
    await upsertVerifiedFomoLabels([...hits].map(([wallet, hit]) => ({ wallet, hit })));
    const payload = { cursor: page.at(-1)?.owner || cursor, checked: checked + page.length, matched: matched + hits.size };
    await updateScanJob(job.id, { status: page.length < pageSize ? "completed" : "running", payload });
    return true;
  } catch (error) {
    await updateScanJob(job.id, { status: "failed", error: error instanceof Error ? error.message : "FOMO label index failed" });
    return true;
  }
}

export async function labelIndexProgress(mint: string): Promise<LabelIndexProgress> {
  const job = [...await listHeliusJobs(mint)].reverse().find(item => item.job_type === "label_enrichment");
  return { state: job?.status || "not_started", checked: Number(job?.payload?.checked || 0), matched: Number(job?.payload?.matched || 0) };
}
