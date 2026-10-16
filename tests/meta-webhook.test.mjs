import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createHandler } from '../api/meta-webhook.mjs';
const env = { META_VERIFY_TOKEN:'test-verify', META_APP_SECRET:'test-secret', META_PAGE_IDS:'123', SUPABASE_URL:'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'test-service-key' };
const url = 'https://example.com/api/meta-webhook';
const body = JSON.stringify({object:'page',entry:[{id:'123',messaging:[{message:{mid:'test-mid',text:'Tin kiểm thử'}}]}]});
function request(raw=body,secret=env.META_APP_SECRET) {return new Request(url,{method:'POST',body:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')}});}
test('verification returns exact plain challenge; wrong/missing token is rejected',async()=>{
 const handler=createHandler({env});
 const response=await handler(new Request(url+'?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=012345'));
 assert.equal(response.status,200);assert.equal(await response.text(),'012345');
 assert.equal((await handler(new Request(url+'?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1'))).status,403);
 assert.equal((await handler(new Request(url))).status,403);
 assert.equal((await createHandler({env:{}})(new Request(url))).status,503);
});
test('rejects invalid signature before writing any data',async()=>{
 let calls=0;const handler=createHandler({env,fetchImpl:async()=>{calls++;}});
 assert.equal((await handler(request(body,'wrong-secret'))).status,403);
 assert.equal((await handler(new Request(url,{method:'POST',body}))).status,403);
 assert.equal(calls,0);
});
test('valid signed events persisted with a stable idempotency hash',async()=>{
 const records=[];const handler=createHandler({env,fetchImpl:async(u,options)=>{assert.match(String(u),/on_conflict=payload_hash/);assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');records.push(JSON.parse(options.body));return new Response(null,{status:201});}});
 const response=await handler(request());assert.equal(response.status,200);assert.equal(await response.text(),'EVENT_RECEIVED');
 assert.equal((await handler(request())).status,200);
 assert.equal(records[0].payload_hash,records[1].payload_hash);assert.equal(records[0].payload.entry[0].id,'123');
});
test('storage failure/timeout never returns a success acknowledgement',async()=>{
 for(const fetchImpl of [async()=>new Response('',{status:500}),async()=>{throw Error('timeout');}]) {
  assert.equal((await createHandler({env,fetchImpl})(request())).status,503);
 }
 assert.equal((await createHandler({env:{...env,SUPABASE_SERVICE_ROLE_KEY:''}})(request())).status,503);
});
test('rejects unconfigured pages, malformed events, oversize payloads, unsupported methods',async()=>{
 const handler=createHandler({env});
 assert.equal((await handler(request(body.replace('123','999')))).status,403);
 assert.equal((await handler(request('{invalid'))).status,400);
 assert.equal((await handler(request('{}'))).status,400);
 assert.equal((await handler(request('x'.repeat(1024*1024+1)))).status,413);
 assert.equal((await handler(new Request(url,{method:'DELETE'}))).status,405);
});
