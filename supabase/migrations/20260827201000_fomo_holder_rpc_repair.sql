-- Production received the consolidated RPC repair in this migration after the
-- leaderboard-only repair had already been recorded. Fresh databases already
-- receive both corrected RPC definitions from the preceding migration.
create index if not exists fomo_identity_evidence_mint_idx
  on public.fomo_identity_evidence (mint) where mint is not null;

revoke all on function public.capture_fomo_token_holder_batch(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.capture_fomo_token_holder_batch(text, text, timestamptz, jsonb) to service_role;

notify pgrst, 'reload schema';
