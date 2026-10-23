/* Credentials exist only in the form during entry, then travel over same-origin HTTPS. */
let misaView=null,misaBusy=false,misaMessage='',misaEpoch=0;
function misaReset(){misaEpoch++;misaView=null;misaMessage='';misaPaint();}
function misaPaint(){const el=document.getElementById('misaSettings');if(el)el.outerHTML=renderMisaSettings();}
function renderMisaSettings(){
 const c=misaView||{environment:'production',clientId:'',taxCode:''},e=escapeHtml;
 return `<section id="misaSettings" class="panel settings-block" aria-label="Tích hợp MISA"><div class="panel-title">Tích hợp › MISA meInvoice API</div>
 <p><strong>Ứng dụng OYEN: hoạt động</strong></p><p role="status">API Hóa đơn điện tử: <strong>${c.approvalStatus==='approved'?'Đã được quản trị máy chủ xác nhận phê duyệt':'Chờ phê duyệt'}</strong></p>
 <p class="settings-help">${misaView?'Đã tải cấu hình từ máy chủ.':'Chưa tải cấu hình máy chủ. Đăng nhập rồi bấm Tải cấu hình để xác nhận trạng thái.'} Phát hành hóa đơn chưa được bật.</p>
 <div class="settings-row"><button class="btn" onclick="misaLogin()" ${misaBusy?'disabled':''}>Đăng nhập quản trị</button><button class="btn" onclick="misaLoad()" ${misaBusy?'disabled':''}>Tải cấu hình</button><button class="btn" onclick="misaLogout()" ${misaBusy?'disabled':''}>Đăng xuất</button></div>
 <form onsubmit="misaSave(event)" autocomplete="off"><fieldset ${misaBusy||!misaView?'disabled':''} style="border:0;padding:0;display:grid;gap:12px">
 <label>Môi trường<select class="input" name="environment"><option value="production" selected>MISA Developer · Chính thức</option></select></label>
 <label>Client ID do MISA cấp<input class="input" name="clientId" required maxlength="200" value="${e(c.clientId)}"></label>
 <label>Client Secret do MISA cấp<input class="input" name="clientSecret" type="password" maxlength="2000" autocomplete="new-password" placeholder="${c.hasClientSecret?'Đã lưu · để trống để giữ nguyên':'Nhập Client Secret từ MISA Developer'}"></label>
 <label>Mã số thuế<input class="input" name="taxCode" required maxlength="14" pattern="[0-9]{10}(-[0-9]{3})?" value="${e(c.taxCode)}" placeholder="0101234567 hoặc 0101234567-001"></label>
 <label>Tài khoản meInvoice<input class="input" name="username" maxlength="1000" autocomplete="off" placeholder="${c.hasUsername?'Đã lưu · để trống để giữ nguyên':'Nhập tài khoản MISA'}"></label>
 <label>Mật khẩu meInvoice<input class="input" name="password" type="password" maxlength="1000" autocomplete="new-password" placeholder="${c.hasPassword?'Đã lưu · để trống để giữ nguyên':'Nhập mật khẩu MISA'}"></label>
 <p class="settings-help">Client Secret và mật khẩu meInvoice là hai thông tin khác nhau. Để trống để giữ bản đã lưu. Khi đổi Client ID hoặc mã số thuế, hãy nhập lại Client Secret, tài khoản và mật khẩu. Secret và mật khẩu được mã hóa phía máy chủ, không được trả về giao diện hay lưu vào bộ nhớ trình duyệt.</p>
 <div class="settings-row"><button class="btn btn-solid" type="submit">Lưu cấu hình</button><button class="btn" type="button" onclick="misaTest()" ${!c.canTest?'disabled':''}>Kiểm tra kết nối đã lưu</button><button class="btn" type="button" disabled>Phát hành hóa đơn · Chưa bật</button></div></fieldset></form>
 <p class="settings-help">Chỉ kiểm tra kết nối sau khi MISA cấp quyền và quản trị máy chủ xác nhận. Kiểm tra sử dụng cấu hình đã lưu và chỉ xác thực tài khoản.</p><p role="status" aria-live="polite">${e(misaMessage)}</p></section>`;
}
async function misaRequest(action,options={}){
 if(location.protocol!=='https:')throw Error('Mở OYEN qua HTTPS để lưu cấu hình MISA.');
 const client=socialAuth(),result=await client?.auth.getSession();
 if(!result?.data?.session?.access_token)throw Error('Vui lòng đăng nhập quản trị trước.');
 const response=await fetch('/api/misa?action='+action,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+result.data.session.access_token},signal:AbortSignal.timeout(20000),redirect:'error'});
 let data;try{data=await response.json();}catch{throw Error('Máy chủ chưa cài đặt API MISA.');}
 if(!response.ok)throw Error(data.message||'Không thực hiện được yêu cầu.');return data;
}
async function misaRun(work){
 if(misaBusy)return;misaBusy=true;misaMessage='Đang xử lý…';const epoch=misaEpoch;misaPaint();
 try{await work(epoch);}catch(error){if(epoch===misaEpoch)misaMessage=error.message;}finally{misaBusy=false;misaPaint();}
}
function misaLoad(){return misaRun(async epoch=>{const data=await misaRequest('config');if(epoch!==misaEpoch)return;misaView=data;misaMessage='Đã tải cấu hình.';});}
function misaSave(event){event.preventDefault();const form=event.target,body=Object.fromEntries(new FormData(form));form.elements.password.value='';form.elements.clientSecret.value='';form.elements.username.value='';return misaRun(async epoch=>{const data=await misaRequest('config',{method:'PUT',body:JSON.stringify(body)});if(epoch!==misaEpoch)return;misaView=data;misaMessage=data.message;});}
function misaTest(){return misaRun(async epoch=>{const data=await misaRequest('test',{method:'POST'});if(epoch===misaEpoch)misaMessage=data.message;});}
function misaLogin(){openModal('Đăng nhập quản trị tích hợp',`<form onsubmit="misaSignIn(event)"><label>Email<input class="input" name="email" type="email" autocomplete="username" required></label><label>Mật khẩu quản trị OYEN<input class="input" name="password" type="password" autocomplete="current-password" required></label><p id="misaLoginError" role="alert"></p><button class="btn btn-solid" type="submit">Đăng nhập</button></form>`,true);}
async function misaSignIn(event){event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;try{const client=socialAuth();if(!client)throw Error('Chưa tải được đăng nhập.');const result=await client.auth.signInWithPassword({email:form.elements.email.value.trim(),password:form.elements.password.value});form.elements.password.value='';if(result.error)throw Error('Không đăng nhập được. Kiểm tra tài khoản quản trị.');closeModal();await misaLoad();}catch(error){document.getElementById('misaLoginError').textContent=error.message;}finally{button.disabled=false;}}
async function misaLogout(){const result=await socialAuth()?.auth.signOut({scope:'local'});if(result?.error){misaMessage='Chưa đăng xuất được. Vui lòng thử lại.';misaPaint();}else misaReset();}
