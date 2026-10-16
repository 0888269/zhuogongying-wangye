'use strict';
const {nextId}=require('./account-migration');
let importQueue=Promise.resolve();
const bcrypt=require('bcrypt');
const roster=require('./member-import');
function registerMemberImport(app,{pool,query,encrypt}){
    app.post('/api/admin/members/import',async(req,res)=>{
        const previous=importQueue;let release;importQueue=new Promise(resolve=>{release=resolve;});await previous;
        try {
        const rows=req.body.users;
        if(!Array.isArray(rows)||!rows.length||rows.length>200)return res.status(400).json({success:false,message:'请提供 1–200 位成员的名单'});
        const accounts=[],skipped=[],errors=[],seen=new Set(),students=new Set();
        for(let i=0;i<rows.length;i++){
            let user;
            try{user=roster.normalize(rows[i]);}catch(e){errors.push('第 '+(i+1)+' 位：'+e.message);continue;}
            const suppliedId=Boolean(user.id);const key=user.id || 'name:'+user.name;
            if(seen.has(key)||(user.student_id&&students.has(user.student_id))){skipped.push({id:user.id,name:user.name,reason:'本次名单重复'});continue;}
            seen.add(key);if(user.student_id)students.add(user.student_id);
            if(!suppliedId)user.id=nextId((await query('SELECT id FROM users')).map(row=>row.id));
            let connection;
            try{
                const sql=suppliedId?(user.student_id?'SELECT id FROM users WHERE id = ? OR student_id = ?':'SELECT id FROM users WHERE id = ?'):'SELECT id FROM users WHERE name = ?';
                const values=suppliedId?(user.student_id?[user.id,user.student_id]:[user.id]):[user.name];
                const existing=await query(sql,values);
                if(existing.length){skipped.push({id:user.id,name:user.name,reason:suppliedId?'账号或学号已存在':'同名成员已存在（同名不同人可填写可选账号）'});continue;}
                const password=user.password || '123456';
                const hash=await bcrypt.hash(password,10);
                connection=await pool.getConnection();await connection.beginTransaction();
                const [again]=await connection.execute(sql,values);
                if(again.length){await connection.rollback();skipped.push({id:user.id,name:user.name,reason:suppliedId?'账号或学号已存在':'同名成员已存在（同名不同人可填写可选账号）'});continue;}
                await connection.execute('INSERT INTO users (id, name, student_id, title, organization, major, email, phone, avatar, encrypted_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [user.id,user.name,user.student_id,'成员','深圳大学医工融合卓越工程师协会',user.major,user.email,user.phone,'/avatar.svg',encrypt(user.id)]);
                await connection.execute('INSERT INTO credentials (user_id, password_hash) VALUES (?, ?)',[user.id,hash]);
                const [badges]=await connection.execute('SELECT DISTINCT name, icon FROM badges WHERE name != ""');
                for(const badge of badges)await connection.execute('INSERT INTO badges (user_id, name, date, icon, unlocked) VALUES (?, ?, ?, ?, ?)',[user.id,badge.name,'LOCKED',badge.icon,0]);
                await connection.commit();accounts.push({id:user.id,name:user.name,student_id:user.student_id,password});
            }catch(e){
                if(connection)await connection.rollback().catch(()=>{});
                if(e.code==='ER_DUP_ENTRY')skipped.push({id:user.id,name:user.name,reason:'账号已存在'});
                else errors.push(user.name+'（'+user.id+'）：导入失败，请重试');
            }finally{if(connection)connection.release();}
        }
        let members=[];
        try{members=await query('SELECT id FROM users ORDER BY created_at ASC, id ASC');}catch{errors.push('成员已创建，但序号刷新失败，请刷新成员列表');}
        const numbers=new Map(members.filter(user=>user.id!=='admin').map((user,index)=>[user.id,index+1]));
        accounts.forEach(account=>{account.member_number=numbers.get(account.id);});
        res.json({success:true,accounts,skipped,errors,message:'新增 '+accounts.length+' 位，跳过 '+skipped.length+' 位，失败 '+errors.length+' 位'});
        }finally{release();}
    });
}
module.exports=registerMemberImport;
