create index if not exists thesis_summaries_mint_idx on public.thesis_summaries (mint);
create index if not exists thesis_summaries_profile_id_idx on public.thesis_summaries (profile_id);
create index if not exists token_social_actors_profile_id_idx on public.token_social_actors (profile_id);

-- Narrow the broad compatibility grant from migration 008 to the exact REST
-- tables used by the WHOAPED server. SECURITY DEFINER RPCs keep their own
-- explicit execute grants and perform writes to the remaining tables.
revoke all on all tables in schema public from service_role;
revoke all on all sequences in schema public from service_role;
alter default privileges in schema public revoke select, insert, update, delete on tables from service_role;
alter default privileges in schema public revoke usage, select, update on sequences from service_role;

grant select, insert, update on public.profiles to service_role;
grant select, insert on public.watchlist to service_role;
grant select, insert, update on public.tokens to service_role;
grant select, insert, update on public.token_positions to service_role;
grant select, insert, update on public.ingestion_jobs to service_role;
grant select, insert, update on public.token_buy_events to service_role;
grant select on public.social_profiles to service_role;
grant select on public.token_social_actors to service_role;
grant select on public.thesis_evidence to service_role;

grant usage, select on sequence public.ingestion_jobs_id_seq to service_role;
