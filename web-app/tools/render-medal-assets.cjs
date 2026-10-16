const {buildViewer,buildLoader}=require('./build-badges.cjs');
const {chromium}=require('@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'medal-assets');
(async()=>{
 await buildViewer();fs.mkdirSync(directory,{recursive:true});
 const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<script src="/medal-art.js"></script>');}
  if(!['/medal-art.js','/badge-viewer.js'].includes(req.url)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,req.url.slice(1))));
 }).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({deviceScaleFactor:2});await page.goto('http://127.0.0.1:'+server.address().port);
  const definitions=await page.evaluate(()=>({icons:Object.keys(window.EngineeringMedalPaths),ranks:[['I','graphite'],['II','bronze'],['III','silver'],['IV','gold']]}));
  const manifest={icons:{},ranks:{}};
  function save(prefix,url){const bytes=Buffer.from(url.split(',')[1],'base64'),hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12),file=prefix+'-'+hash+(url.startsWith('data:image/webp')?'.webp':'.png');fs.writeFileSync(path.join(directory,file),bytes);return file;}
  for(const [key,icon,tone,mark,kind] of [...definitions.icons.map(icon=>[icon,icon,'blue','','icons']),...definitions.ranks.map(([mark,tone])=>[mark,'spark',tone,mark,'ranks'])]){
   const result=await page.evaluate(async options=>{const viewer=await import('/badge-viewer.js');return viewer.renderPortrait(...options);},[icon,true,tone,mark]);
   if(!result)throw Error('Could not render medal '+key);
   manifest[kind][key]={image:save('medal-'+key.toLowerCase(),result.url),mask:save('mount',result.mask)};
  }
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await buildLoader();console.log('Rendered 12 medal portraits and 4 ranks; built the lightweight collection loader.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
