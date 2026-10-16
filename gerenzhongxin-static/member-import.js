(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.MemberRoster=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const aliases={学号:'student_id',学生学号:'student_id',student_id:'student_id',姓名:'name',名字:'name',name:'name',专业:'major',major:'major',邮箱:'email',email:'email',电话:'phone',手机号:'phone',phone:'phone',账号:'id',用户名:'id',id:'id',username:'id',密码:'password',password:'password'};
    function rows(text){
        text=text.replace(/^\uFEFF/,'');const delimiter=text.split(/\r?\n/,1)[0].includes('\t')?'\t':',';
        const result=[];let row=[],field='',quoted=false;
        for(let i=0;i<text.length;i++){
            const c=text[i];
            if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||!field.trim())quoted=!quoted;else field+=c;}
            else if(!quoted&&c===delimiter){row.push(field.trim());field='';}
            else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))result.push(row);row=[];field='';}
            else field+=c;
        }
        if(quoted)throw new Error('CSV 引号未闭合，请检查文件。');
        row.push(field.trim());if(row.some(Boolean))result.push(row);return result;
    }
    function normalize(raw){
        if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('成员数据格式无效');
        const student_id=String(raw.student_id??'').trim(),name=String(raw.name??'').trim();
        const id=String(raw.id || student_id).trim();
        if(student_id && (student_id.length>20||!/^\d+$/.test(student_id)))throw new Error('学号必须是数字，最多 20 位');
        if(!name||name.length>100)throw new Error('请填写姓名，最多 100 字');
        if(id && (!/^[a-zA-Z0-9_-]{1,50}$/.test(id)||id==='admin'))throw new Error('账号只能使用字母、数字、下划线或短横线，且不能为 admin');
        const user={id,student_id,name};
        for(const [key,max] of [['major',255],['email',255],['phone',20]]){
            const value=String(raw[key]??'').trim();if(value.length>max)throw new Error(key+' 内容过长');user[key]=value;
        }
        if(user.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email))throw new Error('邮箱格式无效');
        if(raw.password!==undefined&&raw.password!==''){
            if(typeof raw.password!=='string'||raw.password.length<6||raw.password.length>72)throw new Error('密码应为 6–72 位');
            user.password=raw.password;
        }
        return user;
    }
    function parse(text){
        const data=rows(text);if(!data.length)return {users:[],errors:[]};
        const first=data[0].map(x=>aliases[x.toLowerCase()]);const hasHeader=first.includes('name');
        if(first.some(Boolean)&&!hasHeader)throw new Error('表头需要包含“姓名”，也可以直接粘贴一列名字，不带表头。');
        const fields=hasHeader?first:(data[0].length===1?['name']:['student_id','name','major','email','phone']);const users=[],errors=[],seen=new Set(),students=new Set();
        data.slice(hasHeader?1:0).forEach((row,index)=>{
            const number=index+(hasHeader?2:1);
            try{
                const raw={};fields.forEach((key,i)=>{if(key)raw[key]=row[i] || '';});const user=normalize(raw);
                const key=user.id || 'name:'+user.name;
                if(seen.has(key)||(user.student_id&&students.has(user.student_id)))throw new Error('本次名单中姓名、学号或账号重复');
                seen.add(key);if(user.student_id)students.add(user.student_id);users.push(user);
            }catch(e){errors.push('第 '+number+' 行：'+e.message);}
        });
        if(users.length>200)throw new Error('每次最多导入 200 位成员，请分批粘贴。');
        return {users,errors};
    }
    function csv(rows){return '\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');}
    return {parse,normalize,csv};
});
