const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {createApp,profiles} = require('./harness');
let server,base,fixture;
before(async()=>{ fixture=createApp(); server=fixture.app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve)); base='http://127.0.0.1:'+server.address().port; });
after(async()=>{clearInterval(fixture.cleanupTimer); await new Promise(resolve=>server.close(resolve));});
const call=(url,method='GET',body,token)=>fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
async function login(user='user1'){const response=await call('/api/login','POST',{username:user,password:'test-password'}); assert.equal(response.status,200); return (await response.json()).token;}
test('public assets work; source, exports, and raw templates are private',async()=>{for(const url of ['/','/styles.css','/ui.js','/avatar.svg','/club-logo.png','/growth-catalog.js','/growth-ui.js','/growth.css','/api-client.js','/medal-art.js','/badge-cabinet.js','/badge-viewer.js','/cabinet.css']) assert.equal((await call(url)).status,200,url); for(const url of ['/badge-cabinet.src.js','/badge-cabinet-loader.js','/medal-model.js','/medal-assets/manifest.json','/server.js','/db.js','/growth-service.js','/data.json','/test.json','/database.sql','/node_modules.zip','/user.html','/.env.example']) assert.equal((await call(url)).status,404,url);});
test('account and administrative APIs reject anonymous and forged sessions',async()=>{for(const [url,method,body] of [['/api/admin/users','GET'],['/api/admin/users/user1','DELETE'],['/api/users/user1','PUT',{}],['/api/users/user1','GET'],['/api/change-password','PUT',{}],['/api/encrypt-user-id/user1','GET'],['/api/feishu/login','GET'],['/api/feishu/unbind/user1','POST',{}]]) {assert.equal((await call(url,method,body)).status,401,url); assert.equal((await call(url,method,body,'fake')).status,401,url);}});
test('login validates inputs and password',async()=>{assert.equal((await call('/api/login','POST',{username:'user1',password:'wrong'})).status,401); assert.equal((await call('/api/login','POST',{username:[],password:'x'})).status,400); const token=await login(); assert.match(token,/^[a-f0-9]{64}$/); assert.equal((await call('/api/users/user1','GET',undefined,token)).status,200);});
test('authorization enforces ownership and admin role',async()=>{const token=await login(); assert.equal((await call('/api/admin/users','GET',undefined,token)).status,403); assert.equal((await call('/api/users/admin','PUT',{},token)).status,403); assert.equal((await call('/api/change-password','PUT',{username:'admin'},token)).status,403); assert.equal((await call('/api/feishu/unbind/admin','POST',{},token)).status,403); assert.equal((await call('/api/encrypt-user-id/admin','GET',undefined,token)).status,403); const admin=await login('admin'); assert.equal((await call('/api/admin/users','GET',undefined,admin)).status,200);});
test('logout invalidates the server session',async()=>{const token=await login(); assert.equal((await call('/api/logout','POST',{},token)).status,200); assert.equal((await call('/api/users/user1','GET',undefined,token)).status,401);});
test('OAuth callback rejects forged state',async()=>assert.equal((await call('/api/feishu/callback?code=forged&state=user1')).status,400));
test('public NFC profile works and safely serializes HTML in user data',async()=>{const old=profiles.user1.name; profiles.user1.name='</script><script>alert(1)</script>'; try {const response=await call('/user/'+fixture.encrypt('user1'));assert.equal(response.status,200); const html=await response.text(); assert.ok(!html.includes('const userData = {"id":"user1","name":"</script>')); const match=html.match(/const userData = (.*);/); assert.equal(JSON.parse(match[1]).name,profiles.user1.name);}finally{profiles.user1.name=old;}});
test('HTML inline scripts parse after user data injection',()=>{for(const file of ['index.html','user.html']) {const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace('__USER_DATA__','{}'); for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1],{filename:file});}});
test('missing API routes and malformed JSON return JSON errors',async()=>{
    const missing=await call('/api/not-a-route');assert.equal(missing.status,404);assert.equal((await missing.json()).success,false);
    const invalid=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad json'});assert.equal(invalid.status,400);assert.equal((await invalid.json()).success,false);
});
test('pre-rendered medal assets are cached images and only the image directory is public',async()=>{
    const manifest=require('../medal-assets/manifest.json');
    for(const file of new Set(Object.values({...manifest.icons,...manifest.ranks}).flatMap(item=>[item.image,item.mask]))){
        const response=await call('/medal-assets/'+file);assert.equal(response.status,200,file);assert.match(response.headers.get('content-type'),/image\/(png|webp)/);assert.match(response.headers.get('cache-control'),/immutable/);
    }
    for(const url of ['/medal-assets/manifest.json','/medal-assets/server.js','/medal-assets/%2e%2e%2fserver.js','/medal-assets/'])assert.equal((await call(url)).status,404,url);
});
