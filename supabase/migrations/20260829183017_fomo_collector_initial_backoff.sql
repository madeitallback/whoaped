-- Apply the breaker immediately to an already-known quota failure rather than
-- waiting for the next scheduled invocation to fail again.
update public.fomo_collector_state
set next_attempt_at = timezone('utc', now()) + interval '6 hours',
    updated_at = timezone('utc', now())
where id = 'primary'
  and last_error ilike '%Browserbase request failed (402)%'
  and next_attempt_at is null;
