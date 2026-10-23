const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
test('all inline OYEN scripts parse with integration installed',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');let count=0;
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){new vm.Script(m[1]);count++;}
 assert.ok(count);assert.ok(html.includes('${renderMisaSettings()}'));assert.ok(html.includes('src="misa-settings.js"'));
});
test('pending and approved UI gates; escapes returned configuration',()=>{
 const c={escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'misa-settings.js'),'utf8'),c);
 let ui=vm.runInContext('renderMisaSettings()',c);assert.match(ui,/Chờ phê duyệt/);assert.match(ui,/name="password" type="password"/);assert.match(ui,/onclick="misaTest\(\)" disabled/);
 ui=vm.runInContext(`misaView={environment:'test',appId:'<script>',taxCode:'0101234567',approvalStatus:'approved',canTest:true};renderMisaSettings()`,c);
 assert.ok(!ui.includes('value="<script>"'));assert.ok(ui.includes('&lt;script>'));assert.ok(!ui.includes('onclick="misaTest()" disabled'));assert.match(ui,/disabled>Phát hành hóa đơn/);
});
