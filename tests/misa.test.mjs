import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../api/misa.mjs';
const base={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-key',OYEN_MISA_ADMIN_IDS:'admin',MISA_CONFIG_KEY:Buffer.alloc(32,7).toString('base64')};
const config={environment:'test',appId:'oyen-id',taxCode:'0101234567',username:'misa-user',password:'secret-password'};
const req=(action='config',method='GET',body,token=true)=>new Request('https://oyen.example/api/misa?action='+action,{method,headers:token?{Authorization:'Bearer user-session'}:{},...(body?{body:JSON.stringify(body)}:{})});
function setup(extra={},user='admin',provider={Success:true,Data:'private-token'}){
 let row;const calls=[],env={...base,...extra};
 const handler=createHandler({env,fetchImpl:async(url,options={})=>{calls.push({url,options});if(url.includes('/auth/v1/'))return Response.json({id:user});if(url.includes('/rest/v1/')){if(options.method==='POST'){row=JSON.parse(options.body);return new Response(null,{status:204});}return Response.json(row?[row]:[]);}return Response.json(provider);}});
 return {handler,calls,env,row:()=>row};
}
test('requires verified admin, key and explicit allowlist',async()=>{
 const s=setup();assert.equal((await s.handler(req('config','GET',null,false))).status,401);assert.equal(s.calls.length,0);
 assert.equal((await setup({},'outsider').handler(req())).status,403);
 for(const env of [{MISA_CONFIG_KEY:''},{OYEN_MISA_ADMIN_IDS:''}])assert.equal((await setup(env).handler(req())).status,503);
});
test('encrypted roundtrip, safe response, blank keeps credentials',async()=>{
 const s=setup();let res=await s.handler(req('config','PUT',config));assert.equal(res.status,200);let text=await res.text();assert.ok(!text.includes('secret-password'));assert.ok(!text.includes('misa-user'));
 const row=s.row();assert.ok(!row.encrypted_config.includes('secret-password'));assert.ok(!row.encrypted_config.includes('misa-user'));
 const old=row.encrypted_config;res=await s.handler(req('config','PUT',{...config,username:'',password:''}));assert.equal(res.status,200);assert.notEqual(s.row().encrypted_config,old);
 const data=await (await s.handler(req())).json();assert.equal(data.hasPassword,true);assert.equal(data.hasUsername,true);assert.equal(data.approvalStatus,'pending');assert.equal(data.canIssue,false);
});
test('pending, wrong app or wrong environment never calls MISA',async()=>{
 for(const extra of [{},{MISA_EINVOICE_APPROVED:'true',MISA_APPROVED_APP_ID:'other',MISA_APPROVED_ENVIRONMENT:'test'},{MISA_EINVOICE_APPROVED:'true',MISA_APPROVED_APP_ID:'oyen-id',MISA_APPROVED_ENVIRONMENT:'production'}]){
  const s=setup(extra);await s.handler(req('config','PUT',config));assert.equal((await s.handler(req('test','POST'))).status,409);assert.ok(s.calls.every(c=>!c.url.includes('meinvoice.vn')));
 }
});
test('approved test only authenticates and never exposes provider token',async()=>{
 const s=setup({MISA_EINVOICE_APPROVED:'true',MISA_APPROVED_APP_ID:'oyen-id',MISA_APPROVED_ENVIRONMENT:'test'});await s.handler(req('config','PUT',config));const res=await s.handler(req('test','POST'));assert.equal(res.status,200);const text=await res.text();assert.ok(!text.includes('private-token'));assert.match(text,/"canIssue":false/);
 const calls=s.calls.filter(c=>c.url.includes('meinvoice.vn'));assert.equal(calls.length,1);assert.equal(calls[0].url,'https://testapi.meinvoice.vn/api/integration/auth/token');assert.equal(JSON.parse(calls[0].options.body).password,config.password);assert.equal(calls[0].options.redirect,'error');
});
test('cannot set approval or endpoints via client and cannot issue',async()=>{
 const s=setup();for(const body of [{...config,approvalStatus:'approved'},{...config,endpoint:'https://evil.example'}, {...config,taxCode:'bad'}])assert.equal((await s.handler(req('config','PUT',body))).status,400);
 for(const action of ['issue','publish','invoice'])assert.equal((await s.handler(req(action,'POST'))).status,405);
});
test('provider errors are redacted and changing account clears credentials',async()=>{
 const s=setup({MISA_EINVOICE_APPROVED:'true',MISA_APPROVED_APP_ID:'oyen-id',MISA_APPROVED_ENVIRONMENT:'test'},'admin',{Success:false,Errors:'secret-password',Data:'private-token'});await s.handler(req('config','PUT',config));const res=await s.handler(req('test','POST'));assert.equal(res.status,502);assert.ok(!(await res.text()).includes('secret-password'));
 await s.handler(req('config','PUT',{environment:'production',appId:'oyen-id',taxCode:config.taxCode}));const data=await (await s.handler(req())).json();assert.equal(data.hasPassword,false);assert.equal(data.hasUsername,false);assert.equal(data.canTest,false);
});
test('modified ciphertext fails closed',async()=>{const s=setup();await s.handler(req('config','PUT',config));s.row().encrypted_config='corrupt';assert.equal((await s.handler(req())).status,503);});
