'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createApp,awardRows,growthRecords}=require('./harness');
const catalog=require('../growth-catalog');
let fixture,server,base,admin,member;
async function call(path,method='GET',body,token=admin){return fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});}
before(async()=>{fixture=createApp();server=fixture.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;for(const id of ['admin','user1']){const data=await (await call('/api/login','POST',{username:id,password:'test-password'},null)).json();if(id==='admin')admin=data.token;else member=data.token;}});
after(async()=>{clearInterval(fixture.cleanupTimer);await new Promise(r=>server.close(r));});
test('badge creation and definition editing require an administrator',async()=>{
 for(const [path,method,body] of [['/api/admin/badges','POST',{name:'Unauthorized',icon:'spark'}],['/api/admin/badges/'+encodeURIComponent('PCB 绘图入门'),'PUT',{name:'Changed',icon:'chip'}],['/api/admin/badge-catalog/'+catalog.tasks[0].id,'PUT',{name:'Changed',requirement:'Proof',icon:'exam'}]]){
 assert.equal((await call(path,method,body,null)).status,401);assert.equal((await call(path,method,body,member)).status,403);
 }
});
test('administrator creates an award for every member in the locked state',async()=>{
 assert.equal((await call('/api/admin/badges','POST',{name:'实验室贡献',icon:'team'})).status,200);
 const rows=awardRows.filter(row=>row.name==='实验室贡献');assert.equal(rows.length,3);assert.ok(rows.every(row=>row.unlocked===0 && row.date==='LOCKED'));
 assert.equal((await call('/api/admin/badges','POST',{name:'实验室贡献',icon:'team'})).status,400);
});
test('renaming and changing an award preserves earned states and dates, and names cannot collide',async()=>{
 const old='PCB 绘图入门';const before=awardRows.filter(row=>row.name===old).map(row=>({user_id:row.user_id,date:row.date,unlocked:row.unlocked}));
 assert.equal((await call('/api/admin/badges/'+encodeURIComponent(old),'PUT',{name:'电路创作 100%',icon:'circuit'})).status,200);
 const rows=awardRows.filter(row=>row.name==='电路创作 100%');assert.deepEqual(rows.map(row=>({user_id:row.user_id,date:row.date,unlocked:row.unlocked})),before);assert.ok(rows.every(row=>row.icon==='circuit'));
 assert.equal((await call('/api/admin/badges/'+encodeURIComponent('电路创作 100%'),'PUT',{name:'实验室贡献',icon:'spark'})).status,409);
 assert.equal((await call('/api/admin/badges/missing','PUT',{name:'Missing',icon:'spark'})).status,404);
});
test('editable growth metadata reaches members and public profiles without changing task IDs or approvals',async()=>{
 const task=catalog.tasks[0];growthRecords.set('user1:'+task.id,{user_id:'user1',task_id:task.id,status:'approved',evidence:'private proof',reviewed_at:'2026-10-03'});
 const badge={name:'首块电路',requirement:'完成设计并提交实验结果。',icon:'design'};
 assert.equal((await call('/api/admin/badge-catalog/'+task.id,'PUT',badge)).status,200);
 const data=await (await call('/api/users/user1/growth','GET',null,member)).json();assert.equal(data.growth.records[0].taskId,task.id);assert.equal(data.growth.records[0].status,'approved');assert.equal(data.growth.badgeDefinitions[0].name,badge.name);
 const publicHTML=await (await call('/user/'+fixture.encrypt('user1'))).text();assert.ok(publicHTML.includes(badge.name));assert.ok(!publicHTML.includes('private proof'));
 const adminList=await (await call('/api/admin/badge-catalog')).json();assert.equal(adminList.badges.find(item=>item.id===task.id).requirement,badge.requirement);
});
test('invalid badge names, symbols and growth definitions are rejected',async()=>{
 for(const body of [{name:'',icon:'team'},{name:12,icon:'team'},{name:'x'.repeat(101),icon:'team'},{name:'Valid',icon:'<script>'}])assert.equal((await call('/api/admin/badges','POST',body)).status,400);
 assert.equal((await call('/api/admin/badge-catalog/missing','PUT',{name:'Valid',requirement:'Proof',icon:'exam'})).status,404);
 assert.equal((await call('/api/admin/badge-catalog/'+catalog.tasks[0].id,'PUT',{name:'Valid',requirement:'',icon:'bogus'})).status,400);
});
