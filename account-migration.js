'use strict';
const fs=require('node:fs');const path=require('node:path');const bcrypt=require('bcrypt');
const backupRoot='/home/agent/nfcweb-deployment-backups/member-account-migration';
function nextId(ids){let max=0;for(const id of ids){const m=/^user(\d+)$/.exec(id);if(m)max=Math.max(max,Number(m[1]));}return 'user'+String(max+1).padStart(4,'0');}
async function migrate(pool){
 const request=path.join(backupRoot,'rollback-request.json');
 if(fs.existsSync(request)){const {file}=JSON.parse(fs.readFileSync(request,'utf8'));if(path.dirname(path.resolve(file))!==backupRoot)throw new Error('Invalid rollback backup');await rollback(pool,file);fs.renameSync(request,path.join(backupRoot,'rolled-back.json'));return;}
 if(fs.existsSync(path.join(backupRoot,'rolled-back.json')))return;
 const c=await pool.getConnection();let file;
 try{
 await c.beginTransaction();const [all]=await c.execute('SELECT * FROM users ORDER BY created_at ASC, id ASC FOR UPDATE');
 const targets=all.filter(u=>/^member_\d+_[0-9a-f]{6}$/.test(u.id));if(!targets.length){await c.rollback();return;}
 if(targets.length!==73)throw new Error('Expected 73 imported accounts; found '+targets.length);
 const [refs]=await c.execute("SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME IN ('user_id','reviewed_by')");
 const ids=all.map(u=>u.id),mapping=targets.map(u=>{const id=nextId(ids);ids.push(id);return {old:u.id,id,name:u.name};});
 const tables={users:all};for(const ref of refs){if(!tables[ref.table_name]){const [rows]=await c.query('SELECT * FROM ??',[ref.table_name]);tables[ref.table_name]=rows;}}
 fs.mkdirSync(backupRoot,{recursive:true});file=path.join(backupRoot,Date.now()+'.json');fs.writeFileSync(file,JSON.stringify({mapping,tables,refs,status:'prepared'},null,2),{mode:0o600});const owner=fs.statSync(backupRoot);fs.chownSync(file,owner.uid,owner.gid);
 const hash=await bcrypt.hash('123456',10);
 for(const item of mapping){const user={...targets.find(u=>u.id===item.old),id:item.id};await c.query('INSERT INTO users SET ?',user);
 for(const ref of refs)await c.query('UPDATE ?? SET ?? = ? WHERE ?? = ?',[ref.table_name,ref.column_name,item.id,ref.column_name,item.old]);
 await c.execute('UPDATE credentials SET password_hash = ? WHERE user_id = ?',[hash,item.id]);await c.execute('DELETE FROM users WHERE id = ?',[item.old]);}
 const [after]=await c.execute('SELECT COUNT(*) AS count FROM users');if(Number(after[0].count)!==all.length)throw new Error('Member count changed unexpectedly');for(const table of Object.keys(tables)){const [count]=await c.query('SELECT COUNT(*) AS count FROM ??',[table]);if(Number(count[0].count)!==tables[table].length)throw new Error('Record count changed: '+table);}
 await c.commit();fs.writeFileSync(path.join(backupRoot,'result.json'),JSON.stringify({status:'completed',backup:file,mapping},null,2),{mode:0o644});console.log('Migrated '+mapping.length+' imported accounts');
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
function resolveId(id){try{const result=JSON.parse(fs.readFileSync(path.join(backupRoot,'result.json'),'utf8'));return result.mapping.find(row=>row.old===id)?.id || id;}catch{return id;}}
async function rollback(pool,file){
 const backup=JSON.parse(fs.readFileSync(file,'utf8'));const c=await pool.getConnection();
 try{await c.beginTransaction();for(const item of backup.mapping){const old={...backup.tables.users.find(u=>u.id===item.old)};for(const key of Object.keys(old))if(key.endsWith('_at')&&old[key])old[key]=new Date(old[key]);await c.query('INSERT INTO users SET ?',old);for(const ref of backup.refs)await c.query('UPDATE ?? SET ?? = ? WHERE ?? = ?',[ref.table_name,ref.column_name,item.old,ref.column_name,item.id]);const credential=backup.tables.credentials.find(row=>row.user_id===item.old);await c.execute('UPDATE credentials SET password_hash = ? WHERE user_id = ?',[credential.password_hash,item.old]);await c.execute('DELETE FROM users WHERE id = ?',[item.id]);}await c.commit();fs.unlinkSync(path.join(backupRoot,'result.json'));}catch(e){await c.rollback();throw e;}finally{c.release();}
}
module.exports={nextId,migrate,resolveId,rollback};
