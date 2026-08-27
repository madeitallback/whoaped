create or replace function public.capture_thesis_evidence(
  evidence_mint text,
  evidence_platform text,
  evidence_platform_profile_id text,
  evidence_handle text,
  evidence_display_name text,
  evidence_profile_url text,
  evidence_source_url text,
  evidence_source_text text,
  evidence_published_at timestamptz,
  evidence_captured_at timestamptz,
  evidence_content_hash text,
  evidence_relevance text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_profile_id uuid;
  resolved_evidence_id uuid;
begin
  if evidence_platform not in ('pump', 'fomo') then raise exception 'invalid platform'; end if;
  if evidence_relevance not in ('explicit', 'contextual') then raise exception 'invalid relevance'; end if;

  insert into public.social_profiles (
    platform, platform_profile_id, handle, display_name, profile_url, metadata, observed_at, updated_at
  ) values (
    evidence_platform, evidence_platform_profile_id, nullif(evidence_handle, ''), nullif(evidence_display_name, ''),
    evidence_profile_url, jsonb_build_object('evidence_source', 'extension-user-capture'), evidence_captured_at, evidence_captured_at
  )
  on conflict (platform, platform_profile_id) do update set
    handle = coalesce(excluded.handle, public.social_profiles.handle),
    display_name = coalesce(excluded.display_name, public.social_profiles.display_name),
    profile_url = excluded.profile_url,
    observed_at = excluded.observed_at,
    updated_at = excluded.updated_at
  returning id into resolved_profile_id;

  insert into public.thesis_evidence (
    profile_id, mint, source_url, source_text, published_at, captured_at, content_hash, relevance, metadata
  ) values (
    resolved_profile_id, evidence_mint, evidence_source_url, evidence_source_text, evidence_published_at,
    evidence_captured_at, evidence_content_hash, evidence_relevance,
    jsonb_build_object('capture_method', 'user-triggered-visible-content', 'schema_version', 1)
  )
  on conflict (profile_id, mint, content_hash) do update set
    captured_at = greatest(public.thesis_evidence.captured_at, excluded.captured_at),
    metadata = public.thesis_evidence.metadata || excluded.metadata
  returning id into resolved_evidence_id;

  return resolved_evidence_id;
end;
$$;

revoke all on function public.capture_thesis_evidence(text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.capture_thesis_evidence(text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text) to service_role;
