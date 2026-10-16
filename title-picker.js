(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TitlePicker=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const categories=[
        {name:'职能部门',departments:['宣传部','培训部','组织部'],roles:['干事','副部长','部长'],defaultRole:'干事'},
        {name:'业务部门',departments:['软件部','嵌入式软件部','硬件部','系统部'],roles:['总监','副总监','成员'],defaultRole:'成员'},
        {name:'总协会',departments:['总协会'],roles:['会长','副会长','指导老师'],defaultRole:'会长'}
    ];
    function category(department){return categories.find(group=>group.departments.includes(department==='协会'?'总协会':department));}
    function allowedRoles(department){return category(department)?.roles || [];}
    const suffixes=[...new Set([...categories.flatMap(group=>group.roles),'主席','副主席','秘书长','副秘书长'])].sort((a,b)=>b.length-a.length);
    function parse(value){
        const original=String(value || '').trim();const yearMatch=original.match(/[（(](\d{4})[）)]$/);const year=yearMatch?yearMatch[1]:'';
        const text=(yearMatch?original.slice(0,yearMatch.index):original).trim();
        const role=suffixes.find(role=>text.endsWith(role));
        if(!role)return {original,department:'',role:text,year,legacy:true};
        return {original,department:text.slice(0,-role.length).trim(),role,year,legacy:false};
    }
    function format({department,role,year}){
        return [String(department || '').trim(),String(role || '').trim()].filter(Boolean).join(' ')+(year?'('+year+')':'');
    }
    const instances=new Map();
    function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
    function mount(id){
        if(instances.has(id))return instances.get(id);
        const field=document.getElementById(id);const host=document.querySelector('[data-title-picker="'+id+'"]');if(!field||!host)return null;
        const state={original:'',department:'',role:'',year:'',legacy:true,preserve:true};host.className='title-picker';
        const preview=node('p');preview.className='title-picker-preview';preview.setAttribute('aria-live','polite');
        const groups={};for(const [key,label] of [['department','部门'],['role','职务']]){const group=node('fieldset');group.append(node('legend',label));const buttons=node('div');buttons.className='title-choice-list';group.append(buttons);groups[key]=buttons;host.append(group);}
        const yearLabel=node('label','任职年份');const year=node('select');year.id=id+'-year';yearLabel.htmlFor=year.id;host.append(yearLabel,year);
        host.append(preview);const keep=node('button','保留原职位');keep.type='button';keep.className='secondary-button';keep.onclick=()=>set(id,state.original);host.append(keep);
        function sync(){field.value=state.preserve?state.original:format(state);preview.textContent='显示：'+(field.value || '未设置职位');}
        function draw(){
            groups.department.replaceChildren();groups.role.replaceChildren();
            function choice(key,value,host){const b=node('button',value);b.type='button';
                const current=key==='department'&&state.department==='协会'?'总协会':state[key];
                b.className='title-choice'+(!state.legacy&&current===value?' selected':'');b.setAttribute('aria-pressed',String(!state.legacy&&current===value));
                b.onclick=()=>{state[key]=value;state.legacy=false;state.preserve=false;
                    if(key==='department'&&!allowedRoles(value).includes(state.role))state.role=category(value).defaultRole;
                    if(!state.year)state.year=String(new Date().getFullYear());sync();draw();};host.append(b);
            }
            for(const group of categories){const section=node('div');section.className='title-department-category';const heading=node('span',group.name);heading.className='title-category-label';section.append(heading);const buttons=node('div');buttons.className='title-choice-list';for(const value of group.departments)choice('department',value,buttons);section.append(buttons);groups.department.append(section);}
            const available=allowedRoles(state.department);
            for(const value of available)choice('role',value,groups.role);
            if(!available.length)groups.role.append(node('span','请选择部门后选择职务'));
            const now=new Date().getFullYear();year.replaceChildren();const unknown=node('option','未标年份');unknown.value='';unknown.disabled=true;year.append(unknown);
            const values=new Set(Array.from({length:16},(_,index)=>String(now-10+index)));if(state.year)values.add(state.year);
            for(const value of [...values].sort()){const option=node('option',value+' 年');option.value=value;year.append(option);}year.value=state.year;
            keep.hidden=!state.original;
        }
        year.onchange=()=>{state.year=year.value;state.legacy=false;state.preserve=false;if(!state.role)state.role='成员';sync();draw();};
        const instance={load(value){Object.assign(state,parse(value),{preserve:true});sync();draw();}};instances.set(id,instance);instance.load(field.value);return instance;
    }
    function set(id,value){mount(id)?.load(value);}
    if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('[data-title-picker]').forEach(host=>mount(host.dataset.titlePicker));});
    return {parse,format,set,mount,categories,allowedRoles};
});
