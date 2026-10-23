import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const tokenEndpoint='https://developer.misa.vn/apis/itg/meinvoice/invoice/token';
export function createHandler({env=process.env,fetchImpl=globalThis.fetch}={}){
 return async request=>{
  try{
   const route=new URL(request.url).searchParams.get('action')||'config';
   if(!((route==='config'&&['GET','PUT'].includes(request.method))||(route==='test'&&request.method==='POST')))return reply({message:'Chức năng không được hỗ trợ. Phát hành hóa đơn chưa được bật.'},405);
   const bearer=request.headers.get('authorization');
   if(!/^Bearer [^\s]+$/.test(bearer||''))return reply({message:'Vui lòng đăng nhập quản trị.'},401);
   const admins=(env.OYEN_MISA_ADMIN_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
   const origin=new URL(env.SUPABASE_URL);
   const key=Buffer.from(env.MISA_CONFIG_KEY||'','base64');
   if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||!env.SUPABASE_SERVICE_ROLE_KEY||!admins.length||key.length!==32)return reply({message:'Máy chủ chưa cấu hình bảo mật MISA.'},503);
   const auth=await fetchImpl(origin.origin+'/auth/v1/user',{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:bearer},signal:AbortSignal.timeout(8000),redirect:'error'});
   if(!auth.ok)return reply({message:'Phiên đăng nhập hết hạn.'},401);
   const user=await auth.json();if(!admins.includes(user.id))return reply({message:'Tài khoản chưa được cấp quyền cấu hình MISA.'},403);
   const db=async(path,options={})=>{
    const res=await fetchImpl(origin.origin+'/rest/v1/'+path,{...options,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(8000),redirect:'error'});
    if(!res.ok)throw Error('storage');return res.status===204||options.headers?.Prefer?.includes('return=minimal')?null:res.json();
   };
   const seal=value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('oyen:misa:v1'));const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(x=>x.toString('base64')).join('.');};
   const open=value=>{const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64'));const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('oyen:misa:v1'));cipher.setAuthTag(tag);return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8'));};
   const rows=await db('oyen_misa_config?id=eq.oyen&select=encrypted_config,updated_at');
   let config=rows[0]?open(rows[0].encrypted_config):{};
   // Legacy App ID credentials must never be silently reused with the new gateway.
   if(!('clientId' in config))config={environment:'production',clientId:'',clientSecret:'',taxCode:config.taxCode||'',username:'',password:''};
   const approved=()=>env.MISA_EINVOICE_APPROVED==='true'&&env.MISA_APPROVED_CLIENT_ID===config.clientId&&env.MISA_APPROVED_ENVIRONMENT===config.environment&&!!config.clientId;
   const publicConfig=()=>({environment:config.environment,clientId:config.clientId,taxCode:config.taxCode,hasClientSecret:!!config.clientSecret,hasUsername:!!config.username,hasPassword:!!config.password,applicationStatus:'active',approvalStatus:approved()?'approved':'pending',canTest:approved()&&!!config.clientSecret&&!!config.taxCode&&!!config.username&&!!config.password,canIssue:false,updatedAt:rows[0]?.updated_at||null});
   if(request.method==='GET')return reply(publicConfig());
   if(request.method==='PUT'){
    const raw=await request.text();if(Buffer.byteLength(raw)>8192)return reply({message:'Cấu hình quá lớn.'},413);
    let body;try{body=JSON.parse(raw);}catch{return reply({message:'Cấu hình không hợp lệ.'},400);}
    if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['environment','clientId','clientSecret','taxCode','username','password'].includes(k)))return reply({message:'Trường cấu hình không hợp lệ.'},400);
    if(body.environment!=='production'||typeof body.clientId!=='string'||!/^[-a-zA-Z0-9]{1,200}$/.test(body.clientId)||typeof body.taxCode!=='string'||!/^\d{10}(-\d{3})?$/.test(body.taxCode))return reply({message:'Kiểm tra Client ID và mã số thuế (10 số hoặc 10 số-3 số). Chỉ dùng cổng MISA Developer chính thức.'},400);
    for(const k of ['username','password','clientSecret'])if(k in body&&(typeof body[k]!=='string'||body[k].length>2000||(k==='clientSecret'&&/[\r\n\0]/.test(body[k]))))return reply({message:'Thông tin đăng nhập không hợp lệ.'},400);
    const changed=config.environment!==body.environment||config.clientId!==body.clientId||config.taxCode!==body.taxCode;
    config={environment:body.environment,clientId:body.clientId,taxCode:body.taxCode,clientSecret:body.clientSecret||(changed?'':config.clientSecret),username:body.username?.trim()||(changed?'':config.username),password:body.password||(changed?'':config.password)};
    const updated_at=new Date().toISOString();
    await db('oyen_misa_config?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:'oyen',encrypted_config:seal(config),updated_at,updated_by:user.id})});
    return reply({...publicConfig(),updatedAt:updated_at,message:'Đã lưu cấu hình mã hóa trên máy chủ.'});
   }
   if(!approved())return reply({message:'API Hóa đơn điện tử chờ phê duyệt. Chưa được phép kiểm tra kết nối.'},409);
   if(!config.clientSecret||!config.username||!config.password||!config.taxCode)return reply({message:'Lưu Client Secret và đầy đủ thông tin đăng nhập trước khi kiểm tra.'},400);
   if(config.environment!=='production')return reply({message:'Chưa cấu hình môi trường này trên MISA Developer.'},409);
   const res=await fetchImpl(tokenEndpoint,{method:'POST',headers:{'Content-Type':'application/json',ClientID:config.clientId,ClientSecret:config.clientSecret},body:JSON.stringify({taxcode:config.taxCode,username:config.username,password:config.password}),signal:AbortSignal.timeout(10000),redirect:'error'});
   // Never return provider payloads, tokens, or raw errors to the browser or logs.
   const data=await res.json();
   const success=data.Success??data.success,token=data.Data??data.data;
   if(!res.ok||success!==true||typeof token!=='string'||!token)return reply({message:'MISA chưa xác thực được kết nối. Kiểm tra quyền ứng dụng, Client Secret và thông tin tài khoản.'},502);
   return reply({ok:true,canIssue:false,message:'Xác thực MISA thành công. Chức năng phát hành hóa đơn vẫn chưa được bật.'});
  }catch{return reply({message:'Chưa thực hiện được yêu cầu. Kiểm tra cấu hình máy chủ, cơ sở dữ liệu và kết nối MISA.'},503);}
 };
}
export default {fetch:createHandler()};
