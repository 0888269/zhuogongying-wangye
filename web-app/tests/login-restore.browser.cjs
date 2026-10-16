const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const {createApp}=require('./harness');
(async()=>{
 const f=createApp(),server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const mode of ['expired','offline','timeout']){
  const page=await browser.newPage();
  await page.addInitScript(()=>{localStorage.setItem('nfc_login_user','user1');localStorage.setItem('nfc_login_token','invalid');});
  await page.route('**/api/users/user1',route=>mode==='timeout'?undefined:mode==='offline'?route.abort():route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({success:false})}));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>!document.querySelector('#login-button').disabled&&!document.querySelector('#login-form').hasAttribute('aria-busy'));
  assert.ok(await page.locator('#login-error').textContent());
  assert.equal(await page.locator('#login-container').isVisible(),true);
  if(mode==='expired')assert.equal(await page.evaluate(()=>localStorage.getItem('nfc_login_token')),null);
  await page.close();
 }
 console.log('PASS: expired, offline and timed-out restoration return to usable login with feedback');
 }finally{await browser.close();clearInterval(f.cleanupTimer);await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
