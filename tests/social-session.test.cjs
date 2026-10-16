const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const path=require('node:path');
const appPath=[path.resolve(__dirname,'../index.html'),path.resolve(__dirname,'../../index.html')].find(p=>fs.existsSync(p));
const appHtml=fs.readFileSync(appPath,'utf8');
const moduleCode=appHtml.slice(appHtml.indexOf('/* OYEN Social inbox.'),appHtml.indexOf('/* ================= START ================= */'));
function boot(store){
 let callback,options,fetches=0;
 const client={auth:{getSession:async()=>({data:{session:store.session}}),onAuthStateChange:fn=>{callback=fn;},signOut:async()=>{store.session=null;callback('SIGNED_OUT',null);return {};}}};
 const context=vm.createContext({console,URL,AbortSignal,Promise,location:{protocol:'https:',origin:'https://oyen.example'},localStorage:{getItem:()=>null},window:{supabase:{createClient:(url,key,opts)=>{options=opts;return client;}}},fetch:async(url)=>{fetches++;const route=new URL(url).searchParams.get('route');return new Response(JSON.stringify(route==='/accounts'?{accounts:[{id:'123',provider:'facebook',status:'connected',capabilities:{messages:true}}]}:{threads:[{id:'123:456',customerName:'Khách thật',provider:'facebook'}]}));},Response});
 vm.runInContext("const SUPABASE_URL='https://example.supabase.co',SUPABASE_ANON_KEY='public-key';let TAB='social';function renderMain(){};"+moduleCode,context);
 return {run:s=>vm.runInContext(s,context),settings:()=>options,count:()=>fetches,signedOut:()=>callback('SIGNED_OUT',null)};
}
test('opening inbox restores existing session and loads Facebook exactly once, including after reload',async()=>{
 const store={session:{access_token:'user-session',user:{email:'owner@example.com'}}};
 for(let i=0;i<2;i++){
  const app=boot(store);await app.run('socialRestoreSession()');await app.run('socialRestoreSession()');
  assert.equal(app.run('socialAdminEmail'),'owner@example.com');assert.equal(app.run('socialState.threads.length'),1);assert.equal(app.run('socialState.channel'),'facebook');assert.equal(app.count(),2);
  assert.equal(app.settings().auth.storageKey,'oyen-social-admin-session');assert.equal(app.settings().auth.persistSession,true);assert.equal(app.settings().auth.autoRefreshToken,true);
 }
});
test('no saved session leaves inbox locked; logout and cross-tab logout clear customer data',async()=>{
 const empty=boot({session:null});await empty.run('socialRestoreSession()');assert.equal(empty.count(),0);assert.equal(empty.run('socialAdminEmail'),'');
 const app=boot({session:{access_token:'user-session',user:{email:'owner@example.com'}}});await app.run('socialRestoreSession()');
 app.run("socialState.drafts.secret='private';socialState.orderDrafts.secret={name:'private'}");
 app.signedOut();assert.equal(app.run('socialState.threads.length'),0);assert.equal(app.run('Object.keys(socialState.drafts).length'),0);assert.equal(app.run('Object.keys(socialState.orderDrafts).length'),0);
});
