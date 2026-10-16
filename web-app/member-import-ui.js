'use strict';
window.MemberImportUI=(()=>{
    function el(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
    function download(name,rows){const blob=new Blob([MemberRoster.csv(rows)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    function open(){
        if(document.getElementById('member-import-dialog'))return;
        const previous=document.activeElement;const dialog=el('dialog');dialog.id='member-import-dialog';dialog.className='growth-dialog';
        const title=el('h2','批量添加新成员');title.id='member-import-title';dialog.setAttribute('aria-labelledby',title.id);
        const intro=el('p','只需粘贴一列姓名，每行一位，也可上传 CSV。系统按 user0001 形式连续分配账号，初始密码为 123456；已有同名成员会跳过。同名不同人可加填可选账号，学号、专业、邮箱、电话也可选填。');
        const label=el('label','粘贴成员名单');label.htmlFor='member-roster';
        const input=el('textarea');input.id='member-roster';input.rows=7;input.placeholder='张三\n李四\n王五';
        const fileLabel=el('label','或选择 CSV 文件');fileLabel.htmlFor='member-roster-file';
        const file=el('input');file.type='file';file.id='member-roster-file';file.accept='.csv,text/csv';
        const template=el('button','下载姓名模板');template.type='button';template.className='secondary-button';template.onclick=()=>download('新成员导入模板.csv',[['姓名']]);
        const preview=el('div');preview.id='member-import-preview';
        const status=el('p');status.id='member-import-status';status.setAttribute('role','status');
        const actions=el('div');actions.className='review-actions';
        const close=el('button','取消');close.type='button';close.className='secondary-button';
        const submit=el('button','确认导入');submit.type='button';submit.className='primary-button';submit.id='member-import-submit';submit.disabled=true;
        const exportAccounts=el('button','下载新成员账号和初始密码');exportAccounts.type='button';exportAccounts.className='primary-button';exportAccounts.hidden=true;
        let parsed={users:[],errors:[]},accounts=[],busy=false;
        function render(){
            if(busy)return;preview.replaceChildren();exportAccounts.hidden=true;accounts=[];
            try{parsed=MemberRoster.parse(input.value);submit.disabled=!parsed.users.length;
                status.textContent=parsed.users.length+' 位可导入'+(parsed.errors.length?'；'+parsed.errors.length+' 行将跳过':'');
                if(parsed.users.length){const table=el('table');table.className='member-roster-table';const head=el('tr');for(const value of ['顺序','姓名','账号'])head.append(el('th',value));table.append(head);
                    for(const [index,user] of parsed.users.slice(0,20).entries()){const row=el('tr');row.append(el('td',String(index+1)),el('td',user.name),el('td',user.id || '自动生成'));table.append(row);}preview.append(table);
                    if(parsed.users.length>20)preview.append(el('p','预览前 20 位，实际将导入全部 '+parsed.users.length+' 位。'));}
                if(parsed.errors.length)preview.append(el('p',parsed.errors.join('\n')));
            }catch(e){parsed={users:[],errors:[]};submit.disabled=true;status.textContent=e.message;}
        }
        input.addEventListener('input',()=>{file.value='';render();});
        file.addEventListener('change',async()=>{if(!file.files[0])return;try{if(file.files[0].size>1024*1024)throw new Error('CSV 文件不能超过 1 MB');input.value=await file.files[0].text();render();}catch(e){status.textContent=e.message;}});
        close.onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
        submit.onclick=async()=>{
            if(busy||!parsed.users.length)return;busy=true;submit.disabled=true;close.disabled=true;input.disabled=true;file.disabled=true;status.textContent='正在创建成员账号，请稍候…';
            try{
                const result=await apiRequest('/api/admin/members/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({users:parsed.users})});
                accounts=result.accounts;status.textContent=result.message;preview.replaceChildren();
                if(result.skipped.length)preview.append(el('p','跳过：'+result.skipped.map(item=>item.name+'（'+item.id+'）：'+item.reason).join('；')));
                if(result.errors.length)preview.append(el('p',result.errors.join('\n')));
                if(accounts.length){exportAccounts.hidden=false;preview.append(el('p','请在关闭前下载账号和初始密码，供新成员登录；初始密码不会再次显示。'));}
                close.textContent='完成';submit.hidden=true;input.hidden=true;file.hidden=true;label.hidden=true;fileLabel.hidden=true;template.hidden=true;
                if(typeof loadUserList==='function')loadUserList();
            }catch(e){status.textContent=e.message;submit.disabled=false;}
            finally{busy=false;close.disabled=false;input.disabled=false;file.disabled=false;}
        };
        exportAccounts.onclick=()=>download('新成员登录账号-'+new Date().toISOString().slice(0,10)+'.csv',[['序号','姓名','学号','账号','初始密码'],...accounts.map(a=>[a.member_number,a.name,a.student_id,a.id,a.password])]);
        actions.append(submit,exportAccounts,close);dialog.append(title,intro,label,input,fileLabel,file,template,preview,status,actions);
        dialog.addEventListener('close',()=>{accounts=[];dialog.remove();previous?.focus();});document.body.append(dialog);dialog.showModal();input.focus();
    }
    return {open};
})();
