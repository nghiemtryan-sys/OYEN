// Server-only profile lookup. Never return Page tokens or raw Graph error bodies.
export function safeAvatar(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.searchParams.has('access_token')&&['facebook.com','fbcdn.net','fbsbx.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.href:'';}catch{return '';}
}
export function createProfileLookup({env,fetchImpl,pages,now=Date.now}){
 const cache=new Map();
 function tokenFor(page){
  let tokens={};try{tokens=JSON.parse(env.META_PAGE_ACCESS_TOKENS||'{}');}catch{}
  if(typeof tokens?.[page]==='string')return tokens[page];
  return pages.size===1?env.META_PAGE_ACCESS_TOKEN||'':'';
 }
 async function lookup(row){
  const token=tokenFor(row.page_id);if(!token)return {status:'configuration_required'};
  const key=row.id,old=cache.get(key);if(old&&old.expires>now())return old.value;
  let value={status:'unavailable'};
  try{
   if(!/^\d+$/.test(row.customer_id))return value;
   const version=/^v\d+\.0$/.test(env.META_GRAPH_VERSION||'')?env.META_GRAPH_VERSION:'v26.0';
   const result=await fetchImpl(`https://graph.facebook.com/${version}/${row.customer_id}?fields=name,first_name,last_name,profile_pic`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(2500),redirect:'error'});
   if(result.ok){const p=await result.json();const name=typeof p.name==='string'?p.name.trim():[p.first_name,p.last_name].filter(x=>typeof x==='string').join(' ').trim();const avatar=safeAvatar(p.profile_pic);value={status:name||avatar?'available':'unavailable',...(name?{customerName:name.slice(0,200)}:{}),customerAvatar:avatar};}
  }catch{}
  if(cache.size>=1000)cache.delete(cache.keys().next().value);
  cache.set(key,{value,expires:now()+(value.status==='available'?600000:30000)});
  return value;
 }
 async function enrich(rows){
  // Four parallel requests, at most eight new lookups per list load.
  const wanted=rows.filter(r=>!cache.has(r.id)||cache.get(r.id).expires<=now()).slice(0,8);
  for(let i=0;i<wanted.length;i+=4)await Promise.all(wanted.slice(i,i+4).map(lookup));
  return rows.map(row=>cache.get(row.id)?.value||{status:tokenFor(row.page_id)?'pending':'configuration_required'});
 }
 return {lookup,enrich};
}
