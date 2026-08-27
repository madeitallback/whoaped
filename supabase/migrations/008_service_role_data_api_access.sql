-- Supabase stopped auto-exposing new public tables to the Data API in 2026.
-- WHOAPED uses only the server-side service role; browser roles remain revoked.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select, update on sequences to service_role;
alter default privileges in schema public revoke execute on functions from public;

revoke all on table
  public.tokens,
  public.social_profiles,
  public.wallet_links,
  public.token_positions,
  public.thesis_evidence,
  public.thesis_summaries,
  public.signal_snapshots,
  public.ingestion_jobs,
  public.provider_events,
  public.token_buy_events,
  public.token_social_actors
from anon, authenticated;

revoke all on function public.claim_ingestion_jobs(integer, integer) from public, anon, authenticated;
revoke all on function public.replace_token_positions(text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.upsert_fomo_identity_batch(text, jsonb) from public, anon, authenticated;
revoke all on function public.capture_thesis_evidence(text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.upsert_pump_identity_batch(text, jsonb) from public, anon, authenticated;

grant execute on function public.claim_ingestion_jobs(integer, integer) to service_role;
grant execute on function public.replace_token_positions(text, timestamptz, jsonb) to service_role;
grant execute on function public.upsert_fomo_identity_batch(text, jsonb) to service_role;
grant execute on function public.capture_thesis_evidence(text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.upsert_pump_identity_batch(text, jsonb) to service_role;
