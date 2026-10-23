-- Server-only storage. Never put this table in the public key/value store.
begin;
create table if not exists public.oyen_misa_config (
 id text primary key check (id = 'oyen'),
 encrypted_config text not null,
 updated_at timestamptz not null default now(),
 updated_by uuid not null
);
alter table public.oyen_misa_config enable row level security;
revoke all on table public.oyen_misa_config from public, anon, authenticated;
grant select, insert, update on table public.oyen_misa_config to service_role;
commit;
