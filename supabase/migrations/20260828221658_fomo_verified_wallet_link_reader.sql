create or replace function public.read_fomo_verified_wallet_links()
returns table(handle text, wallet text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct on (lower(sp.handle)) sp.handle, wl.wallet
  from public.social_profiles sp
  join public.wallet_links wl on wl.profile_id = sp.id
  where sp.platform = 'fomo'
    and sp.handle is not null
    and wl.valid_to is null
    and wl.confidence in ('high', 'verified')
  order by lower(sp.handle), wl.valid_from desc;
$$;

revoke all on function public.read_fomo_verified_wallet_links() from public, anon, authenticated;
grant execute on function public.read_fomo_verified_wallet_links() to service_role;
notify pgrst, 'reload schema';
