const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createApp,growthRecords}=require('./harness');
(async()=>{
 const fixture=createApp();const server=fixture.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const errors=[];const out=path.join(__dirname,'../artifacts');fs.mkdirSync(out,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.fill('#username','user1');await page.fill('#password','test-password');await page.locator('#login-form button[type=submit]').click();
  await page.locator('#main-container').waitFor({state:'visible'});
  // A slow saved-session response must leave visible feedback and disable duplicate login.
  let resumeRestore;
  await page.route('**/api/users/user1',async route=>{await new Promise(resolve=>resumeRestore=resolve);await route.continue();});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Redirecting...',exact:true}).waitFor();
  assert.equal(await page.locator('#login-button').isDisabled(),true);
  assert.equal(await page.locator('#login-form').getAttribute('aria-busy'),'true');
  await page.screenshot({path:path.join(out,'saved-login-redirecting.png')});
  await page.waitForFunction(()=>document.querySelector('#login-form').getAttribute('aria-busy')==='true');
  while(!resumeRestore)await page.waitForTimeout(20);
  resumeRestore();
  await page.locator('#main-container').waitFor({state:'visible'});await page.unroute('**/api/users/user1');
  await page.locator('.member-hero').screenshot({path:path.join(out,'my-card-header.png')});
  await page.evaluate(()=>{document.querySelector('#badges-section').classList.remove('hidden');document.querySelector('#card-section').classList.add('hidden');});
  await page.locator('.task-medal .medal-model-portrait').first().waitFor();
  assert.equal(await page.locator('.task-medal:not(.approved) .medal-occupant').count(),0,'unearned medals leave vacant mounts');
  assert.equal(await page.locator('.rank-medal.unearned .medal-occupant').count(),0,'unearned ranks leave vacant mounts');
  await page.locator('.rank-medal.unearned').first().click();await page.locator('#growth-dialog').waitFor();assert.equal(await page.locator('.cabinet-inspector').count(),0);await page.locator('#growth-dialog .dialog-close').click();
  await page.locator('#growth-wall-host').screenshot({path:path.join(out,'cabinet-desktop.png')});
  const tile=page.locator('.task-medal').first();await tile.click();await page.locator('.inspector-stage canvas').waitFor();await page.waitForTimeout(750);
  assert.equal(await tile.locator('.medal-occupant').evaluate(el=>getComputedStyle(el).opacity),'0','taking a medal out leaves its mount empty');
  assert.equal(await tile.locator('.medal-recess').evaluate(el=>getComputedStyle(el.parentElement).opacity),'1','mount remains visible during inspection');
  const zoomStage=page.locator('.inspector-stage');
  await page.locator('.zoom-in').click();assert.equal(await zoomStage.getAttribute('data-zoom'),'1.25');
  await zoomStage.hover();await page.mouse.wheel(0,-200);await page.waitForFunction(()=>Number(document.querySelector('.inspector-stage').dataset.zoom)>1.25);
  await zoomStage.focus();await page.keyboard.press('Home');assert.equal(await zoomStage.getAttribute('data-zoom'),'1.00');
  // Two captured touch pointers magnify without rotating the medal.
  const zoomBox=await zoomStage.boundingBox(),touch=await page.context().newCDPSession(page);
  const x=zoomBox.x+zoomBox.width/2,y=zoomBox.y+zoomBox.height/2;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-65,y,id:1},{x:x+65,y,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(Number(await zoomStage.getAttribute('data-zoom'))>1.5,'pinch magnifies medal');
  await page.locator('.cabinet-inspector-panel').screenshot({path:path.join(out,'medal-zoom.png')});
  await touch.detach();await page.locator('.reset-model').click();
  const stage=page.locator('.inspector-stage');const before=await stage.getAttribute('data-rotation');const box=await stage.boundingBox();
  await page.mouse.move(box.x+box.width*.3,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.55,{steps:12});await page.mouse.up();await page.waitForTimeout(100);
  assert.notEqual(await stage.getAttribute('data-rotation'),before,'drag rotates actual model');
  await page.locator('.reset-model').click();await stage.focus();await page.keyboard.press('ArrowRight');
  await stage.evaluate(el=>el.blur());
  await page.locator('.cabinet-inspector-panel').screenshot({path:path.join(out,'badge-3d.png')});
  await stage.focus();for(let i=0;i<21;i++)await page.keyboard.press('ArrowRight');await stage.evaluate(el=>el.blur());
  await page.locator('.cabinet-inspector-panel').screenshot({path:path.join(out,'medal-reverse.png')});
  await page.keyboard.press('Escape');await page.locator('.cabinet-inspector').waitFor({state:'detached'});assert.equal(await tile.evaluate(el=>el===document.activeElement),true);
  assert.equal(await tile.locator('.medal-occupant').evaluate(el=>getComputedStyle(el).opacity),'1','closing returns the medal to its mount');
  // Closing during entry must cancel that flight rather than start two competing animations.
  await tile.click();await page.locator('.cabinet-inspector').waitFor();await page.evaluate(()=>{document.querySelector('.inspector-close').click();document.querySelector('.inspector-close').click();});
  await page.locator('.cabinet-inspector').waitFor({state:'detached'});assert.equal(await page.locator('.badge-lifted,.medal-flight').count(),0);
  await tile.click();await page.locator('.inspector-stage canvas').waitFor();
  await page.setViewportSize({width:1100,height:900});await page.evaluate(()=>document.querySelector('.task-medal').scrollIntoView({block:'center'}));
  // Sample a paused return flight just before its endpoint to check live slot geometry.
  const returnGeometry=await page.evaluate(()=>{
   document.querySelector('.inspector-close').click();const flight=document.querySelector('.medal-flight');const animation=flight.getAnimations()[0];animation.pause();animation.currentTime=319;
   const a=flight.getBoundingClientRect(),b=document.querySelector('.task-medal .medal-art').getBoundingClientRect();
   return {dx:Math.abs(a.left+a.width/2-b.left-b.width/2),dy:Math.abs(a.top+a.height/2-b.top-b.height/2),heightError:Math.abs(a.height-Math.min(b.height,b.width/.75)),canvasInFlight:!!flight.querySelector('canvas')};
  });
  assert.ok(returnGeometry.dx<2&&returnGeometry.dy<2&&returnGeometry.heightError<2&&returnGeometry.canvasInFlight,'return lands in the current slot without aspect distortion');
  await page.evaluate(()=>{const animation=document.querySelector('.medal-flight').getAnimations()[0];animation.currentTime=160;});
  await page.screenshot({path:path.join(out,'medal-return-midway.png')});
  await page.evaluate(()=>document.querySelector('.medal-flight').getAnimations()[0].finish());await page.locator('.cabinet-inspector').waitFor({state:'detached'});
  await tile.click();await page.locator('.inspector-stage canvas').waitFor();await page.evaluate(()=>document.querySelector('.inspector-close').click());await page.setViewportSize({width:1280,height:1000});await page.locator('.cabinet-inspector').waitFor({state:'detached'});
  assert.equal(await page.locator('.badge-lifted,.medal-flight').count(),0,'resize during close cleans up the flight');
  for(const [index,name] of [[1,'medal-star']]){
   await page.locator('.task-medal').nth(index).click();await page.waitForTimeout(700);await page.locator('.inspector-stage').evaluate(el=>el.blur());
   await page.locator('.cabinet-inspector-panel').screenshot({path:path.join(out,name+'.png')});await page.keyboard.press('Escape');await page.locator('.cabinet-inspector').waitFor({state:'detached'});
  }
  const orderBefore=await page.locator('.task-medal').evaluateAll(items=>items.map(item=>item.dataset.medalId));
  const empty=page.locator('.task-medal.locked[data-source="growth"]').first();const emptyId=await empty.getAttribute('data-medal-id');
  await empty.click();assert.equal(await page.locator('.cabinet-inspector').count(),0,'empty slots open requirements directly');await page.locator('#growth-evidence').waitFor();
  await page.fill('#growth-evidence','完成课程设计与实验验证，附上作品说明以及测试记录。');await page.locator('.submission-form button[type=submit]').click();await page.locator('#growth-dialog').waitFor({state:'detached'});
  assert.ok([...growthRecords.values()].some(row=>row.status==='pending'));
  assert.equal(await page.locator('[data-medal-id="'+emptyId+'"] .medal-occupant').count(),0,'pending approval keeps the slot empty');
  const admin=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'test-password'})}).then(r=>r.json());
  const approval=await fetch(base+'/api/admin/growth/user1/'+emptyId,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+admin.token},body:JSON.stringify({status:'approved',reviewNote:'Verified fixture evidence'})});assert.equal(approval.status,200);
  await page.evaluate(()=>GrowthUI.refresh());await page.locator('[data-medal-id="'+emptyId+'"] .medal-occupant .medal-model-portrait').waitFor();
  assert.deepEqual(await page.locator('.task-medal').evaluateAll(items=>items.map(item=>item.dataset.medalId)),orderBefore,'approval fills the original slot without reordering');
  const occupied=page.locator('[data-medal-id="'+emptyId+'"]');assert.equal(await occupied.locator('.medal-recess.model-recess').count(),1,'earned medal retains its fitted recess');
  await occupied.click();await page.locator('.inspector-stage canvas').waitFor();await page.keyboard.press('Escape');await page.locator('.cabinet-inspector').waitFor({state:'detached'});
  await page.evaluate(()=>{document.activeElement?.blur();document.querySelectorAll('.notification').forEach(n=>n.classList.add('hidden'));});
  await page.locator('#growth-wall-host').screenshot({path:path.join(out,'cabinet-earned.png')});
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});await page.locator('#growth-wall-host').scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no mobile overflow '+width);
   await page.locator('#growth-wall-host').screenshot({path:path.join(out,'cabinet-'+width+'.png')});
   await tile.click();await page.waitForTimeout(700);const st=page.locator('.inspector-stage');
   const touch=await page.context().newCDPSession(page),bounds=await st.boundingBox(),initial=await st.getAttribute('data-rotation');
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+50,y:bounds.y+120}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bounds.x+160,y:bounds.y+140}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(80);
   assert.notEqual(await st.getAttribute('data-rotation'),initial,'touch rotates model '+width);await touch.detach();
   await page.keyboard.press('Escape');await page.locator('.cabinet-inspector').waitFor({state:'detached'});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await tile.click();await page.locator('.inspector-close').click();await page.locator('.cabinet-inspector').waitFor({state:'detached'});
  await page.goto(base+'/user/'+encodeURIComponent(fixture.encrypt('user1')));await page.locator('.task-medal .medal-model-portrait').first().waitFor();await page.locator('.task-medal').first().click();await page.locator('.inspector-stage canvas').waitFor();await page.locator('.inspect-details').click();await page.locator('#growth-dialog').waitFor();assert.equal(await page.locator('#growth-evidence').count(),0);
  // Browsers without WebGL retain task access through the original detail dialog.
  const fallback=await browser.newPage();await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
  await fallback.goto(base+'/user/'+encodeURIComponent(fixture.encrypt('user1')));await fallback.locator('.task-medal').first().click();await fallback.locator('#growth-dialog').waitFor();await fallback.close();
  // A cancelled first-open must not surprise the user with a late modal after the module downloads.
  const slow=await browser.newPage();let releaseViewer;const gate=new Promise(resolve=>{releaseViewer=resolve;});
  await slow.route('**/badge-viewer.js',async route=>{await gate;await route.continue();});
  await slow.goto(base+'/user/'+encodeURIComponent(fixture.encrypt('user1')));await slow.locator('.task-medal').first().click();
  await slow.locator('.medal-loading').waitFor();await slow.keyboard.press('Escape');assert.equal(await slow.locator('.medal-loading').count(),0);
  releaseViewer();await slow.evaluate(()=>import('/badge-viewer.js'));await slow.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await slow.locator('.cabinet-inspector').count(),0);
  await slow.locator('.task-medal').first().click();await slow.locator('.inspector-stage canvas').waitFor();await slow.keyboard.press('Escape');await slow.locator('.cabinet-inspector').waitFor({state:'detached'});await slow.close();
  assert.deepEqual(errors,[]);console.log('PASS: empty mounts, direct task access, pending stays empty, approval fills the same slot, 3D rotation, touch, keyboard/focus, 320/390 layouts, public view, reduced motion, WebGL fallback.');
 }finally{await browser.close();clearInterval(fixture.cleanupTimer);await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
