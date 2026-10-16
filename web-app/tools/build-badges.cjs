const esbuild=require('esbuild');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
async function buildViewer(){await esbuild.build({absWorkingDir:root,entryPoints:['badge-cabinet.src.js'],bundle:true,minify:true,format:'esm',outfile:'badge-viewer.js'});}
async function buildLoader(){await esbuild.build({absWorkingDir:root,entryPoints:['badge-cabinet-loader.js'],bundle:true,minify:true,format:'iife',outfile:'badge-cabinet.js'});}
module.exports={buildViewer,buildLoader};
if(require.main===module)(async()=>{await buildViewer();await buildLoader();})().catch(e=>{console.error(e);process.exitCode=1;});
