-- Run once in Supabase SQL Editor. Does not change existing OYEN tables.
begin;
create table if not exists public.oyen_meta_webhook_events (
  id bigint generated always as identity primary key,
  payload_hash text not null unique check (length(payload_hash) = 64),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);
alter table public.oyen_meta_webhook_events enable row level security;
revoke all on public.oyen_meta_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.oyen_meta_webhook_events to service_role;
grant usage, select on sequence public.oyen_meta_webhook_events_id_seq to service_role;
commit;
-- No frontend policy: only the trusted backend may access raw customer events.
-- A separate worker must normalize events into tenant-owned threads/messages and
-- deduplicate by provider message/comment ID before showing them in the app.
