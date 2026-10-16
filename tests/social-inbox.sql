-- Integration checks. Everything below rolls back, including synthetic messages.
begin;
do $$
declare sample jsonb; total integer;
begin
 sample:='{"object":"page","entry":[{"id":"999000111222333","messaging":[{"sender":{"id":"999000111222444"},"recipient":{"id":"999000111222333"},"timestamp":1792112400000,"message":{"mid":"oyen-rollback-test-m1","text":"OYEN synthetic transaction test"}}]}]}'::jsonb;
 perform public.oyen_ingest_meta_inbox(sample,now());
 update public.oyen_social_threads set unread=false,status='done' where id='999000111222333:999000111222444';
 perform public.oyen_ingest_meta_inbox(sample,now());
 select count(*) into total from public.oyen_social_messages where page_id='999000111222333';
 if total<>1 then raise exception 'Message deduplication failed'; end if;
 if exists(select 1 from public.oyen_social_threads where id='999000111222333:999000111222444' and (unread or status<>'done')) then raise exception 'Retry changed manual state'; end if;
 sample:=jsonb_set(sample,'{entry,0,messaging,0,message,mid}','"oyen-rollback-test-m2"');
 sample:=jsonb_set(sample,'{entry,0,messaging,0,timestamp}','1792112460000');
 perform public.oyen_ingest_meta_inbox(sample,now());
 if not exists(select 1 from public.oyen_social_threads where id='999000111222333:999000111222444' and unread and status='open') then raise exception 'New message did not reopen thread'; end if;
 if has_table_privilege('anon','public.oyen_social_messages','SELECT') or has_table_privilege('authenticated','public.oyen_social_messages','SELECT') then raise exception 'Customer messages exposed to browser roles'; end if;
 if has_function_privilege('anon','public.oyen_ingest_meta_inbox(jsonb,timestamptz)','EXECUTE') then raise exception 'Ingestion exposed to anon'; end if;
end $$;
rollback;
select 'PASS: deduplication, manual state, new-message state, private access; synthetic data rolled back' as result;
