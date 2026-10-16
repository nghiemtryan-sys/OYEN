import {createProfileLookup} from '../lib/facebook-profile.mjs';
// All customer data is served only after Supabase verifies the user's session.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const ids=value=>new Set((value||'').split(',').map(x=>x.trim()).filter(Boolean));
const thread=(row,profile={})=>({id:row.id,provider:'facebook',customerName:profile.customerName||row.customer_name||`Khách Facebook · ${row.customer_id.slice(-6)}`,customerAvatar:profile.customerAvatar||'',profileStatus:profile.status||'pending',preview:row.preview||'',unread:row.unread,status:row.status,updatedAt:row.updated_at});
const message=row=>({id:row.provider_message_id,direction:row.direction,text:row.text,createdAt:row.created_at});
export function createHandler({env=process.env,fetchImpl=globalThis.fetch}={}){
 const profiles=createProfileLookup({env,fetchImpl,pages:ids(env.META_PAGE_IDS)});
 return async function handle(request){
  try{
   const url=new URL(request.url),route=new URL(url.searchParams.get('route')||'/accounts','https://social.invalid');
   if(!['GET','PATCH','POST'].includes(request.method))return json({message:'Phương thức không được hỗ trợ.'},405);
   const bearer=request.headers.get('authorization');
   if(!bearer?.match(/^Bearer [^\s]+$/))return json({message:'Đăng nhập quản trị để mở hộp tin nhắn.'},401);
   const admins=ids(env.OYEN_SOCIAL_ADMIN_IDS),pages=ids(env.META_PAGE_IDS);
   let origin;try{origin=new URL(env.SUPABASE_URL);}catch{return json({message:'Máy chủ chưa cấu hình Supabase.'},503);}
   if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||!env.SUPABASE_SERVICE_ROLE_KEY||!admins.size||!pages.size)return json({message:'Cần cấu hình tài khoản quản trị và Page trên máy chủ.'},503);
   const auth=await fetchImpl(origin.origin+'/auth/v1/user',{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:bearer},signal:AbortSignal.timeout(8000)});
   if(!auth.ok)return json({message:'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.'},401);
   const user=await auth.json();
   if(!user.id||!admins.has(user.id))return json({message:'Tài khoản này chưa được cấp quyền quản lý tin nhắn.'},403);
   const db=async(path,options={})=>{
    const res=await fetchImpl(origin.origin+'/rest/v1/'+path,{...options,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(8000)});
    if(!res.ok)throw new Error('database');
    return res.status===204?null:res.json();
   };
   if(route.pathname==='/accounts'&&request.method==='GET')return json({accounts:[...pages].map(id=>({id,provider:'facebook',name:env.META_PAGE_NAME||'Facebook Page OYEN',status:'connected',capabilities:{messages:true,comments:false,sendMessages:false,replyComments:false}}))});
   if(route.pathname==='/connect')return json({message:'Facebook đã được cấu hình tại Meta Developers. Chọn Facebook rồi bấm Làm mới. Zalo và TikTok cần tích hợp API riêng.'},409);
   let body={};
   if(request.method!=='GET'){
    if(Number(request.headers.get('content-length'))>8192)return json({message:'Dữ liệu quá lớn.'},413);
    const raw=await request.text();if(raw.length>8192)return json({message:'Dữ liệu quá lớn.'},413);
    try{body=JSON.parse(raw);}catch{return json({message:'Dữ liệu không hợp lệ.'},400);}
    if(!body||typeof body!=='object'||Array.isArray(body))return json({message:'Dữ liệu không hợp lệ.'},400);
   }
   const page=request.method==='GET'?route.searchParams.get('accountId'):body.accountId;
   if(typeof page!=='string'||!pages.has(page))return json({message:'Page không thuộc kết nối của ứng dụng.'},403);
   if(route.pathname==='/threads'&&request.method==='GET'){
    if(route.searchParams.get('kind')!=='messages')return json({message:'Chưa bật đồng bộ bình luận Facebook.'},409);
    const rows=await db('oyen_social_threads?select=*&page_id=eq.'+encodeURIComponent(page)+'&order=updated_at.desc,id.asc&limit=101');
    const visible=rows.slice(0,100),info=await profiles.enrich(visible);
    return json({threads:visible.map((r,i)=>thread(r,info[i])),hasMore:rows.length>100,profileStatus:info.some(p=>p.status==='configuration_required')?'configuration_required':info.some(p=>p.status==='unavailable')?'unavailable':'available'});
   }
   const match=route.pathname.match(/^\/threads\/([^/]+)(\/reply)?$/);
   if(!match)return json({message:'Không tìm thấy chức năng.'},404);
   let id;try{id=decodeURIComponent(match[1]);}catch{return json({message:'Mã hội thoại không hợp lệ.'},400);}
   if(!/^\d+:\d+$/.test(id)||id.split(':')[0]!==page)return json({message:'Hội thoại không thuộc Page đang chọn.'},403);
   const filter='id=eq.'+encodeURIComponent(id)+'&page_id=eq.'+encodeURIComponent(page);
   const rows=await db('oyen_social_threads?select=*&'+filter+'&limit=1');
   if(!rows.length)return json({message:'Không tìm thấy hội thoại.'},404);
   const ownedThread=rows[0];
   if(match[2])return json({message:'Chưa bật gửi trả lời. Cần cấu hình Page Access Token và quyền pages_messaging trước.'},409);
   if(request.method==='GET'){
    const rows=await db('oyen_social_messages?select=*&thread_id=eq.'+encodeURIComponent(id)+'&order=created_at.desc,provider_message_id.desc&limit=201');
    const profile=await profiles.lookup(ownedThread);
    return json({messages:rows.slice(0,200).reverse().map(message),hasMore:rows.length>200,customer:thread(ownedThread,profile)});
   }
   if(request.method==='PATCH'){
    const patch={};
    if('unread'in body){if(typeof body.unread!=='boolean')return json({message:'Trạng thái đọc không hợp lệ.'},400);patch.unread=body.unread;}
    if('status'in body){if(!['open','done'].includes(body.status))return json({message:'Trạng thái xử lý không hợp lệ.'},400);patch.status=body.status;}
    if(!Object.keys(patch).length)return json({message:'Không có thay đổi hợp lệ.'},400);
    await db('oyen_social_threads?'+filter,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
    return json({ok:true});
   }
   return json({message:'Phương thức không được hỗ trợ.'},405);
  }catch{return json({message:'Chưa đọc được dữ liệu hội thoại. Kiểm tra bảng Supabase và thử lại.'},503);}
 };
}
export default {fetch:createHandler()};
