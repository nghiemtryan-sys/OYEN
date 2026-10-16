import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProfileLookup,safeAvatar} from '../lib/facebook-profile.mjs';
const row={id:'123:456',page_id:'123',customer_id:'456'};
test('profile lookup requires a server Page token and never guesses cross-Page credentials',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('Should not fetch');};
 assert.equal((await createProfileLookup({env:{},pages:new Set(['123']),fetchImpl}).lookup(row)).status,'configuration_required');
 assert.equal((await createProfileLookup({env:{META_PAGE_ACCESS_TOKEN:'server-token'},pages:new Set(['123','999']),fetchImpl}).lookup(row)).status,'configuration_required');
 assert.equal(calls,0);
});
test('profile uses bearer header, caches results, and sanitizes avatar URLs',async()=>{
 const calls=[];const lookup=createProfileLookup({env:{META_PAGE_ACCESS_TOKEN:'server-token'},pages:new Set(['123']),fetchImpl:async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify({name:'Khách thật',profile_pic:'https://platform-lookaside.fbsbx.com/profilepic/?hash=abc'}));}});
 const profile=await lookup.lookup(row);assert.equal(profile.customerName,'Khách thật');assert.match(profile.customerAvatar,/fbsbx/);
 assert.equal((await lookup.lookup(row)).customerName,'Khách thật');assert.equal(calls.length,1);
 assert.equal(calls[0].opts.headers.Authorization,'Bearer server-token');assert.doesNotMatch(calls[0].url,/server-token/);
 assert.doesNotMatch(JSON.stringify(profile),/server-token/);
 for(const bad of ['javascript:alert(1)','http://fbcdn.net/a','https://evil.example/a','https://fbcdn.net.evil.example/a','https://fbcdn.net/a?access_token=secret'])assert.equal(safeAvatar(bad),'');
});
test('Graph failure is a temporary profile error, without leaking Graph response data',async()=>{
 const lookup=createProfileLookup({env:{META_PAGE_ACCESS_TOKEN:'server-token'},pages:new Set(['123']),fetchImpl:async()=>new Response(JSON.stringify({error:{message:'sensitive graph diagnostic'}}),{status:403})});
 assert.deepEqual(await lookup.lookup(row),{status:'unavailable'});
});
