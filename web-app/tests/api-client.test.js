'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','api-client.js'),'utf8');
function client(fetch){const sandbox={window:{fetch},module:{exports:{}}};vm.runInNewContext(source,sandbox);return sandbox.module.exports;}
test('HTML 404 response gives actionable deployment error instead of JSON parse error',async()=>{const request=client(async()=>new Response('<html>Not Found</html>',{status:404}));await assert.rejects(()=>request('/api/users/user1/growth/task'),/接口尚未部署/);});
test('proxy HTML failure and offline failure retain clear retry feedback',async()=>{await assert.rejects(()=>client(async()=>new Response('<html>Bad gateway</html>',{status:502}))('/api/test'),/服务暂时不可用/);await assert.rejects(()=>client(async()=>{throw new Error('offline')})('/api/test'),/内容已保留/);});
test('API JSON error preserves the server message',async()=>{const request=client(async()=>new Response(JSON.stringify({success:false,message:'请补充完成说明'}),{status:400}));await assert.rejects(()=>request('/api/test'),/请补充完成说明/);});
test('malformed success bodies do not masquerade as successful submissions',async()=>{for(const body of ['<html>login page</html>','null','[]','"wrong"'])await assert.rejects(()=>client(async()=>new Response(body))('/api/test'),/服务器/);});
test('long submission evidence is passed unchanged and valid JSON succeeds',async()=>{const evidence='已完成实验，附完整报告。'.repeat(70);let sent;const request=client(async(url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({success:true,growth:{pending:1}}))});const data=await request('/api/test',{method:'POST',body:JSON.stringify({evidence})});assert.equal(sent.evidence,evidence);assert.equal(data.growth.pending,1);});