const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {createApp,awardRows}=require('./harness');
(async()=>{
 for(let i=0;i<10;i++)awardRows.push({user_id:'user1',name:'Additional award '+i,date:'2026.10.03',icon:['cog','bolt','award'][i%3],unlocked:1});
 const fixture=createApp(),server=fixture.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 await page.addInitScript(()=>{window.longTasks=[];window.gpuContexts=0;const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(/webgl/.test(kind))window.gpuContexts++;return getContext.call(this,kind,...args);};new PerformanceObserver(list=>window.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});});
 const base='http://127.0.0.1:'+server.address().port;await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.fill('#username','user1');await page.fill('#password','test-password');await page.locator('#login-form button[type=submit]').click();await page.locator('#main-container').waitFor({state:'visible'});
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('#main-container').waitFor({state:'visible'});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const restore=await page.evaluate(()=>({paintReadyMs:Math.round(performance.now()),longTasks:window.longTasks,gpuContexts:window.gpuContexts,viewerLoaded:performance.getEntriesByType('resource').some(e=>e.name.includes('badge-viewer.js'))}));
 await page.locator('#tab-badges').click();await page.locator('.task-medal').first().waitFor();
 const expand=await page.evaluate(async()=>{window.longTasks=[];const t=performance.now();document.querySelector('.wall-expand').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {paintReadyMs:Math.round(performance.now()-t),count:document.querySelectorAll('.task-medal').length,longTasks:window.longTasks,gpuContexts:window.gpuContexts,viewerLoaded:performance.getEntriesByType('resource').some(e=>e.name.includes('badge-viewer.js'))};});
 assert.equal(expand.count,55);assert.equal(restore.gpuContexts,0);assert.equal(expand.gpuContexts,0);assert.equal(restore.viewerLoaded,false);assert.equal(expand.viewerLoaded,false);
 const output={restore,expand};fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../artifacts/performance-'+(process.argv[2]||'latest')+'.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output));
 }finally{await browser.close();clearInterval(fixture.cleanupTimer);await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
