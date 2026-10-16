-- Run in the same Supabase project as META_WEBHOOK.sql. Safe to rerun.
-- No customer data or inbox permissions are granted to browser/anonymous roles.
begin;
create table if not exists public.oyen_social_threads (
 id text primary key,
 page_id text not null,
 customer_id text not null,
 customer_name text,
 preview text not null default '',
 unread boolean not null default true,
 status text not null default 'open' check (status in ('open','done')),
 updated_at timestamptz not null default now(),
 unique(page_id,customer_id)
);
create index if not exists oyen_social_threads_recent on public.oyen_social_threads(page_id,updated_at desc);
create table if not exists public.oyen_social_messages (
 page_id text not null,
 provider_message_id text not null,
 thread_id text not null references public.oyen_social_threads(id),
 direction text not null check(direction in ('in','out')),
 text text not null,
 created_at timestamptz not null,
 primary key(page_id,provider_message_id)
);
create index if not exists oyen_social_messages_thread on public.oyen_social_messages(thread_id,created_at desc);
alter table public.oyen_social_threads enable row level security;
alter table public.oyen_social_messages enable row level security;
revoke all on public.oyen_social_threads, public.oyen_social_messages from public,anon,authenticated;
grant select,insert,update,delete on public.oyen_social_threads, public.oyen_social_messages to service_role;

create or replace function public.oyen_ingest_meta_inbox(p_payload jsonb,p_received_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare e jsonb; m jsonb; page text; customer text; mid text; tid text;
 incoming boolean; event_at timestamptz; content text; inserted integer;
begin
 if p_payload->>'object' is distinct from 'page' then return; end if;
 for e in select value from pg_catalog.jsonb_array_elements(p_payload->'entry') loop
  page:=e->>'id';
  if page is null or page !~ '^[0-9]+$' then continue; end if;
  for m in select value from pg_catalog.jsonb_array_elements(coalesce(e->'messaging','[]'::jsonb)) loop
   mid:=m->'message'->>'mid';
   if mid is null or mid='' then continue; end if;
   incoming:=coalesce(m->'message'->>'is_echo','false')<>'true';
   if incoming then
    if m->'recipient'->>'id' is distinct from page then continue; end if;
    customer:=m->'sender'->>'id';
   else
    if m->'sender'->>'id' is distinct from page then continue; end if;
    customer:=m->'recipient'->>'id';
   end if;
   if customer is null or customer !~ '^[0-9]+$' or customer=page then continue; end if;
   tid:=page||':'||customer;
   event_at:=p_received_at;
   if (m->>'timestamp') ~ '^[0-9]{10,13}$' then event_at:=pg_catalog.to_timestamp((m->>'timestamp')::numeric/1000); end if;
   content:=coalesce(m->'message'->>'text','[Tệp đính kèm từ Facebook]');
   if m->'message'->>'is_deleted'='true' then content:='[Tin nhắn đã thu hồi]'; end if;
   insert into public.oyen_social_threads(id,page_id,customer_id,preview,unread,updated_at)
   values(tid,page,customer,content,incoming,event_at) on conflict(id) do nothing;
   insert into public.oyen_social_messages(page_id,provider_message_id,thread_id,direction,text,created_at)
   values(page,mid,tid,case when incoming then 'in' else 'out' end,content,event_at)
   on conflict(page_id,provider_message_id) do nothing;
   get diagnostics inserted=row_count;
   if inserted>0 then
    update public.oyen_social_threads set preview=content,updated_at=event_at,
      unread=case when incoming then true else unread end,
      status=case when incoming then 'open' else status end
    where id=tid and updated_at<=event_at;
   end if;
  end loop;
 end loop;
end;
$$;
revoke all on function public.oyen_ingest_meta_inbox(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.oyen_ingest_meta_inbox(jsonb,timestamptz) to service_role;
create or replace function public.oyen_meta_inbox_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.oyen_ingest_meta_inbox(new.payload,new.received_at);
 new.processed_at:=pg_catalog.now();
 new.processing_error:=null;
 return new;
end;
$$;
revoke all on function public.oyen_meta_inbox_trigger() from public,anon,authenticated;
drop trigger if exists oyen_meta_to_inbox on public.oyen_meta_webhook_events;
create trigger oyen_meta_to_inbox before insert on public.oyen_meta_webhook_events
for each row execute function public.oyen_meta_inbox_trigger();
-- Existing events are replayed in arrival order; provider message IDs deduplicate.
do $$ declare r record; begin
 for r in select * from public.oyen_meta_webhook_events where processed_at is null order by received_at,id loop
  perform public.oyen_ingest_meta_inbox(r.payload,r.received_at);
  update public.oyen_meta_webhook_events set processed_at=now(),processing_error=null where id=r.id;
 end loop;
end $$;
commit;
