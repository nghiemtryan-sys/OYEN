import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../api/social.mjs';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only',OYEN_SOCIAL_ADMIN_IDS:'admin-1',META_PAGE_IDS:'1284862328043789'};
const page=env.META_PAGE_IDS,tid=page+':12345';
const row={id:tid,page_id:page,customer_id:'12345',preview:'Xin chào',unread:true,status:'open',updated_at:'2026-10-16T01:00:00Z'};
const req=(route,options={})=>new Request('https://oyen.example/api/social?route='+encodeURIComponent(route),{...options,headers:{Authorization:'Bearer verified-user',...(options.headers||{})}});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
function setup(user={id:'admin-1'},dbBody=[row]){
 const calls=[];
 const handler=createHandler({env,fetchImpl:async(url,opts)=>{calls.push({url,opts});return url.includes('/auth/')?response(user):opts.method==='PATCH'?new Response(null,{status:204}):response(dbBody);}});
 return {handler,calls};
}
test('unauthenticated and unlisted users cannot read any customer table',async()=>{
 const {handler,calls}=setup({id:'customer-1',user_metadata:{role:'admin'}});
 assert.equal((await handler(new Request('https://oyen.example/api/social'))).status,401);
 assert.equal(calls.length,0);
 assert.equal((await handler(req('/threads?accountId='+page+'&kind=messages'))).status,403);
 assert.equal(calls.length,1);assert.match(calls[0].url,/auth\/v1\/user$/);
 assert.equal(calls[0].opts.headers.Authorization,'Bearer verified-user');
});
test('auth server failure or missing allowlist fails closed',async()=>{
 const bad=createHandler({env,fetchImpl:async()=>response({},401)});
 assert.equal((await bad(req('/accounts'))).status,401);
 let called=false;
 const missing=createHandler({env:{...env,OYEN_SOCIAL_ADMIN_IDS:''},fetchImpl:async()=>{called=true;}});
 assert.equal((await missing(req('/accounts'))).status,503);assert.equal(called,false);
});
test('account capabilities reflect receive-only integration and contain no server key',async()=>{
 const {handler}=setup();const res=await handler(req('/accounts'));
 assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'no-store');
 const body=await res.text();assert.doesNotMatch(body,/server-only/);
 const a=JSON.parse(body).accounts[0];assert.equal(a.id,page);assert.equal(a.capabilities.messages,true);assert.equal(a.capabilities.sendMessages,false);assert.equal(a.capabilities.comments,false);
});
test('other Page and forged thread IDs are rejected before any database access',async()=>{
 const {handler,calls}=setup();
 assert.equal((await handler(req('/threads?accountId=999&kind=messages'))).status,403);
 assert.equal((await handler(req('/threads/999%3A123?accountId='+page))).status,403);
 assert.equal((await handler(req('/threads/abc?accountId='+page))).status,403);
 assert.equal(calls.filter(c=>c.url.includes('/rest/')).length,0);
});
test('thread list uses configured Page filter, server credentials and sanitized fields',async()=>{
 const {handler,calls}=setup();const result=await handler(req('/threads?accountId='+page+'&kind=messages'));
 const data=await result.json();assert.equal(data.threads[0].preview,'Xin chào');assert.equal(data.threads[0].id,tid);
 const call=calls[1];assert.match(call.url,new RegExp('page_id=eq.'+page));assert.equal(call.opts.headers.Authorization,'Bearer server-only');
});
test('messages load chronologically and require an existing owned thread',async()=>{
 let n=0;const h=createHandler({env,fetchImpl:async url=>url.includes('/auth/')?response({id:'admin-1'}):++n===1?response([row]):response([{provider_message_id:'m2',direction:'out',text:'Chào bạn',created_at:'2026-10-16T01:02:00Z'},{provider_message_id:'m1',direction:'in',text:'Xin chào',created_at:'2026-10-16T01:01:00Z'}])});
 const res=await h(req('/threads/'+encodeURIComponent(tid)+'?accountId='+page));
 assert.deepEqual((await res.json()).messages.map(m=>m.id),['m1','m2']);
 const {handler}=setup({id:'admin-1'},[]);
 assert.equal((await handler(req('/threads/'+encodeURIComponent(tid)+'?accountId='+page))).status,404);
});
test('mark read and handled only updates allowed fields',async()=>{
 const {handler,calls}=setup();
 const result=await handler(req('/threads/'+encodeURIComponent(tid),{method:'PATCH',body:JSON.stringify({accountId:page,unread:false,status:'done',page_id:'999',customer_name:'injected'})}));
 assert.equal(result.status,200);
 assert.deepEqual(JSON.parse(calls.at(-1).opts.body),{unread:false,status:'done'});
 assert.match(calls.at(-1).url,/page_id=eq\./);
 assert.equal((await handler(req('/threads/'+encodeURIComponent(tid),{method:'PATCH',body:JSON.stringify({accountId:page,unread:'false'})}))).status,400);
});
test('reply is explicitly disabled; database failures never appear successful',async()=>{
 const {handler,calls}=setup();
 assert.equal((await handler(req('/threads/'+encodeURIComponent(tid)+'/reply',{method:'POST',body:JSON.stringify({accountId:page,text:'Không gửi thật'})}))).status,409);
 assert.equal(calls.some(c=>c.url.includes('facebook')),false);
 const bad=createHandler({env,fetchImpl:async url=>url.includes('/auth/')?response({id:'admin-1'}):response({},500)});
 assert.equal((await bad(req('/threads?accountId='+page+'&kind=messages'))).status,503);
});
