'use strict';
window.GrowthUI = (() => {
    const catalog = window.GrowthCatalog;
    let currentProfile = null;
    let wallStage = 'all';
    let wallExpanded = false;
    let earnedOnly = false;
    let lastFocused = null;
    const stateNames = {approved:'已点亮',pending:'待审核',rejected:'需补充',locked:'未完成'};
    function el(tag, className, text) { const node=document.createElement(tag); if(className)node.className=className; if(text!==undefined)node.textContent=text; return node; }
    function button(text, className, handler) { const node=el('button',className,text);node.type='button';if(handler)node.addEventListener('click',handler);return node; }
    function archivedIds(){return currentProfile?.growth?.archivedTaskIds || [];}
    function activeTasks(){return catalog.tasks.filter(task=>!archivedIds().includes(task.id));}
    function definition(task) { return {...task,...currentProfile?.growth?.badgeDefinitions?.find(item=>item.id===task.id)}; }
    function record(taskId) { return currentProfile?.growth?.records?.find(item=>item.taskId===taskId); }
    function ownProfile() { return currentProfile && typeof currentUser!=='undefined' && currentUser===currentProfile.id; }
    function notify(title,message) { if(typeof showNotification==='function')showNotification(title,message); }
    function medal(icon, earned=false, tone='blue',mark='',mounted=false) {
        const art=el('span','medal-art '+tone+(earned?' illuminated':'')+(mounted?' medal-mount '+(earned?'occupied':'vacant'):''));art.setAttribute('aria-hidden','true');
        Object.assign(art.dataset,{icon,earned:String(earned),tone,mark,mounted:String(mounted)});
        if(mounted&&window.BadgeCabinet?.mount){window.BadgeCabinet.mount(art);return art;}
        if(mounted){const recess=el('span','medal-recess');recess.append(window.createEngineeringMedal(icon,false,tone,mark));art.append(recess);if(earned){const occupant=el('span','medal-occupant');occupant.append(window.createEngineeringMedal(icon,true,tone,mark));art.append(occupant);}}
        else art.append(window.createEngineeringMedal(icon,earned,tone,mark));return art;
    }
    function summaryPanel(summary) {
        const panel=el('section','growth-overview');
        const top=el('div','growth-overview-top');const heading=el('div');heading.append(el('span','section-kicker','YOUR GROWTH JOURNEY'),el('h2','',summary.currentRank));
        const number=el('div','growth-number');number.append(el('strong','',String(summary.approved)),el('span','',' / '+summary.total+' 项已通过'));top.append(heading,number);
        const progress=el('progress','growth-progress');progress.max=summary.total;progress.value=summary.approved;progress.setAttribute('aria-label','成长任务完成度');
        const stage=catalog.stages.find(item=>item.id===summary.currentStage);
        panel.append(top,progress,el('p','growth-next',summary.approved===summary.total?'所有成长任务已完成，继续创造你的医工故事。':'当前路径：'+stage.name+' · '+stage.subtitle));
        panel.append(el('p','approval-note',summary.pending?summary.pending+' 项材料正在等待管理员审核。审核通过后，徽章会自动点亮。':'完成任务 → 提交材料 → 管理员审核 → 点亮徽章'));
        return panel;
    }
    function renderRoute(host, publicView=false) {
        host.replaceChildren();const summary=catalog.summarize(currentProfile?.growth?.records || [],archivedIds());
        host.append(summaryPanel(summary));
        const route=el('div','growth-route');
        summary.stages.forEach(stage=>{
            const details=el('details','route-stage'+(stage.completed===stage.total?' complete':stage.id===summary.currentStage?' current':''));details.open=stage.id===summary.currentStage;
            const title=el('summary','route-stage-summary');const marker=el('span','route-marker',stage.completed===stage.total?'✓':String(stage.index+1).padStart(2,'0'));
            const words=el('span','route-stage-words');words.append(el('span','route-version',stage.version),el('strong','',stage.name),el('span','',stage.subtitle));
            title.append(marker,words,el('span','route-count',stage.completed+' / '+stage.total),el('span','route-chevron','⌄'));
            const body=el('div','route-stage-body');body.append(el('p','route-description',stage.description));
            const list=el('ul','task-list');
            stage.tasks.forEach(original=>{const task=definition(original);
                const status=record(task.id)?.status || 'locked';const li=el('li','');
                const row=button('','task-row '+status,()=>openTask(task,publicView));
                const marker=el('span','task-state-icon',status==='approved'?'✓':status==='pending'?'◷':status==='rejected'?'!':'○');
                row.append(marker,el('span','task-name',task.name),el('span','task-status',stateNames[status]));row.setAttribute('aria-label',task.name+'，'+stateNames[status]);li.append(row);list.append(li);
            });
            body.append(list);details.append(title,body);route.append(details);
        });
        host.append(route,el('p','route-footnote','等级按路线累计达成：初阶 → 初级工程师；完成中阶 → 中级工程师；完成常规产品及以前阶段 → 高级工程师；完成全部阶段 → 卓越工程师。'));
    }
    function collection() {
        return activeTasks().map(task=>({...definition(task),source:'growth',status:record(task.id)?.status || 'locked'}))
            .sort((a,b)=>Number(b.status==='approved')-Number(a.status==='approved'));
    }

    function renderWall(host, publicView=false) {
        const summary=catalog.summarize(currentProfile?.growth?.records || [],archivedIds());const items=collection();host.replaceChildren();
        const approved=items.filter(item=>item.status==='approved').length;
        const top=el('div','wall-header');const text=el('div');text.append(el('span','wall-kicker','EXCELLENCE / COLLECTION'),el('h2','','卓越图鉴'),el('p','','每一次实践，都值得被铭记。'));
        const count=el('div','wall-total');count.append(el('strong','',String(approved)),el('span','',' / '+items.length+' 已点亮'));top.append(text,count);host.append(top);
        host.append(el('p','rank-label','工程师等级 · 滑动查看'));
        const ranks=el('div','rank-wall');summary.ranks.forEach(rank=>{
            const tile=button('','rank-medal '+rank.tone+(rank.unlocked?' earned':' unearned'),()=>inspectBadge(tile,{name:rank.name,icon:'spark',earned:rank.unlocked,tone:rank.tone,mark:['I','II','III','IV'][catalog.ranks.findIndex(item=>item.id===rank.id)]},()=>openRank(rank)));
            const art=el('span','rank-art');art.append(medal('spark',rank.unlocked,rank.tone,['I','II','III','IV'][catalog.ranks.findIndex(item=>item.id===rank.id)],true));
            tile.append(art,el('strong','',rank.name),el('span','rank-progress',rank.unlocked?'等级已达成':rank.completed+' / '+rank.total));tile.setAttribute('aria-label',rank.name+'，'+(rank.unlocked?'已达成':'尚未达成'));ranks.append(tile);
        });host.append(ranks);
        const filters=el('div','wall-filters');
        for(const [label,value] of [['全部',false],['已点亮',true]]){const filter=button(label,'wall-filter'+(earnedOnly===value?' selected':''),()=>{earnedOnly=value;wallExpanded=false;renderWall(host,publicView)});filter.setAttribute('aria-pressed',String(earnedOnly===value));filters.append(filter);}
        const select=el('select','wall-stage-select');select.setAttribute('aria-label','选择徽章阶段');
        for(const stage of [{id:'all',name:'全部荣誉'},...catalog.stages]){const option=el('option','',stage.name);option.value=stage.id;select.append(option);}select.value=wallStage;
        select.addEventListener('change',()=>{wallStage=select.value;wallExpanded=false;renderWall(host,publicView)});filters.append(select);host.append(filters);
        const filtered=items.filter(item=>(wallStage==='all' || item.stageId===wallStage) && (!earnedOnly || item.status==='approved'));
        const grid=el('div','task-medal-grid');
        filtered.slice(0,wallExpanded?filtered.length:12).forEach(item=>{
            const tile=button('','task-medal '+item.status,()=>inspectBadge(tile,{...item,earned:item.status==='approved',mark:item.source==='growth'?String(catalog.tasks.findIndex(task=>task.id===item.id)+1).padStart(2,'0'):'CLUB'},()=>openTask(item,publicView)));tile.dataset.source=item.source;tile.dataset.medalId=item.id;
            const displayStatus={approved:'已收藏',pending:'待审核 · 预留位',rejected:'待补充 · 预留位',locked:'尚未获得'};
            tile.append(medal(item.icon,item.status==='approved','blue',item.source==='growth'?String(catalog.tasks.findIndex(task=>task.id===item.id)+1).padStart(2,'0'):'CLUB',true),el('strong','',item.name),el('span','medal-status',displayStatus[item.status]));tile.setAttribute('aria-label',item.name+'，'+displayStatus[item.status]);grid.append(tile);
        });if(!grid.children.length)grid.append(el('p','wall-empty','这里还没有点亮的徽章。完成任务并通过审核后，会出现在这里。'));host.append(grid);
        if(filtered.length>12)host.append(button(wallExpanded?'收起图鉴':'查看全部 '+filtered.length+' 枚徽章','wall-expand',()=>{wallExpanded=!wallExpanded;renderWall(host,publicView)}));
        requestAnimationFrame(()=>window.BadgeCabinet?.upgrade(host));
        host.append(el('p','wall-note','已获得的勋章优先展示，其余按初阶、中阶、高阶等成长阶段排列。工程师等级按成长路线累计达成。'));
    }
    function inspectBadge(tile,options,details){if(options.earned&&window.BadgeCabinet)window.BadgeCabinet.inspect(options,tile,details);else details();}
    function dialogBase(title) {
        const old=document.getElementById('growth-dialog');if(old)old.remove();lastFocused=document.activeElement;
        const dialog=el('dialog','growth-dialog');dialog.id='growth-dialog';dialog.setAttribute('aria-labelledby','growth-dialog-title');
        const header=el('div','growth-dialog-header');const h=el('h2','',title);h.id='growth-dialog-title';header.append(h,button('×','dialog-close',()=>dialog.close()));dialog.append(header);
        dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)dialog.close();}});
        dialog.addEventListener('close',()=>{lastFocused?.focus();dialog.remove();});document.body.append(dialog);return dialog;
    }
    function openRank(rank) {
        const dialog=dialogBase(rank.name);dialog.append(medal('spark',rank.unlocked,rank.tone,['I','II','III','IV'][catalog.ranks.findIndex(item=>item.id===rank.id)]));
        dialog.append(el('p','dialog-description','累计完成并通过管理员审核的范围：'+catalog.stages.slice(0,rank.through+1).map(stage=>stage.name).join(' → ')),el('p','dialog-description',rank.completed+' / '+rank.total+' 项已通过'));
        dialog.showModal();
    }
    function openTask(task,publicView=false) {
        const submitted=record(task.id);const status=submitted?.status || 'locked';const dialog=dialogBase(task.name);dialog.append(medal(task.icon,status==='approved'),el('span','dialog-status '+status,stateNames[status]),el('p','dialog-description',task.requirement));
        if(submitted?.approvedAt)dialog.append(el('p','dialog-meta','获得于 '+(submitted.awardDate || new Date(submitted.approvedAt).toLocaleDateString('zh-CN'))));
        if(publicView || !ownProfile()){dialog.append(el('p','dialog-meta','任务与徽章展示由管理员审核确认。'));dialog.showModal();return;}
        if(submitted?.evidence){const evidence=el('div','submitted-evidence');evidence.append(el('strong','','已提交的完成说明'),el('p','',submitted.evidence));dialog.append(evidence);}
        if(submitted?.reviewNote)dialog.append(el('p','review-note','审核反馈：'+submitted.reviewNote));
        if(status==='pending' || status==='approved'){dialog.append(el('p','dialog-meta',status==='pending'?'材料已提交。管理员审核通过后，这枚徽章会自动点亮。':'这项任务已通过审核，徽章已点亮。'));dialog.showModal();return;}
        const form=el('form','submission-form');const label=el('label','','完成说明与证明链接');label.htmlFor='growth-evidence';const field=el('textarea','');field.id='growth-evidence';field.name='evidence';field.required=true;field.minLength=10;field.maxLength=2000;field.rows=7;field.wrap='soft';field.setAttribute('aria-describedby','growth-evidence-help growth-evidence-count');field.placeholder='说明你完成了什么，可附课程成绩、作品、演示或证明材料链接（至少 10 字）。';field.value=submitted?.evidence || '';
        const error=el('p','submission-error');error.setAttribute('role','alert');const send=el('button','primary-button',status==='rejected'?'补充材料并重新提交':'提交审核');send.type='submit';
        const help=el('p','dialog-meta','至少 10 字，最多 2000 字。可粘贴长链接或多段文字。');help.id='growth-evidence-help';
        const counter=el('span','evidence-count',field.value.length+' / 2000');counter.id='growth-evidence-count';
        function resizeEvidence(){counter.textContent=field.value.length+' / 2000';field.style.height='auto';field.style.height=Math.max(190,Math.min(380,field.scrollHeight))+'px';}
        field.addEventListener('input',resizeEvidence);
        form.append(label,field,counter,help,error,send);dialog.append(form);
        form.addEventListener('submit',async event=>{event.preventDefault();send.disabled=true;error.textContent='';const profileId=currentProfile.id;
            try {const data=await apiRequest('/api/users/'+encodeURIComponent(profileId)+'/growth/'+encodeURIComponent(task.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({evidence:field.value})});if(currentProfile?.id===profileId){currentProfile.growth=data.growth;render(currentProfile);}dialog.close();notify('提交成功','材料正在等待管理员审核');}
            catch(e){error.textContent=e.message;}finally{send.disabled=false;}
        });dialog.showModal();resizeEvidence();
    }
    function render(profile) {
        const changedProfile=currentProfile?.id!==profile.id;
        currentProfile=profile;const summary=catalog.summarize(profile.growth?.records || [],archivedIds());
        if(changedProfile){wallStage='all';earnedOnly=false;wallExpanded=false;}
        const route=document.getElementById('growth-route-host');if(route)renderRoute(route);
        const wall=document.getElementById('growth-wall-host');if(wall)renderWall(wall);
        const publicWall=document.getElementById('public-growth-wall');if(publicWall)renderWall(publicWall,true);
        const publicRoute=document.getElementById('public-growth-route');if(publicRoute)renderRoute(publicRoute,true);
        const count=document.getElementById('hero-badge-count');if(count){count.textContent='';count.append(document.createTextNode(collection().filter(item=>item.status==='approved').length+' '),el('small','','/ '+collection().length));}
        const rank=document.getElementById('member-growth-rank');if(rank)rank.textContent=summary.currentRank;
        const preview=document.getElementById('growth-preview');if(preview){preview.querySelector('strong').textContent=summary.currentRank;preview.querySelector('.growth-preview-copy').textContent=summary.approved+' 项已通过'+(summary.pending?' · '+summary.pending+' 项待审核':'')+' · 从每一个小任务开始';}
    }
    async function refresh() {
        if(!currentProfile)return;const profileId=currentProfile.id;
        const button=document.getElementById('refresh-growth');if(button)button.disabled=true;
        try {const data=await apiRequest('/api/users/'+encodeURIComponent(profileId)+'/growth');if(currentProfile?.id===profileId){currentProfile.growth=data.growth;render(currentProfile);}notify('已刷新','成长进度已更新');}
        catch(error){notify('刷新失败',error.message || '请稍后重试');}finally{if(button)button.disabled=false;}
    }
    let reviewStatus='pending';
    async function loadReviews() {
        const panel=document.querySelector('.growth-review-panel');
        if(panel&&!panel.querySelector('.review-filters')){const filters=el('div','review-filters');for(const [status,label] of [['pending','待审核'],['approved','已通过'],['rejected','已退回']]){const tab=button(label,'secondary-button',()=>{reviewStatus=status;loadReviews();});tab.dataset.status=status;filters.append(tab);}panel.insertBefore(filters,document.getElementById('growth-review-list'));}
        panel?.querySelectorAll('.review-filters button').forEach(tab=>tab.setAttribute('aria-pressed',String(tab.dataset.status===reviewStatus)));
        const requestedStatus=reviewStatus;
        const host=document.getElementById('growth-review-list');if(!host)return;host.replaceChildren(el('p','review-empty','正在加载待审核任务…'));
        try {const data=await apiRequest('/api/admin/growth/submissions?status='+requestedStatus);if(requestedStatus!==reviewStatus)return;host.replaceChildren();
            if(!data.submissions.length){host.append(el('p','review-empty','此分类暂无申请。'));return;}
            data.submissions.forEach(submission=>{const original=catalog.tasks.find(item=>item.id===submission.task_id);if(!original)return;const task=definition(original);const card=el('article','review-card');card.append(el('p','review-member',(submission.member_number?'序号 '+submission.member_number+' · ':'')+submission.user_name+' · '+submission.user_id),el('h3','',task.name),el('p','review-evidence',submission.evidence),el('p','dialog-meta','提交于 '+new Date(submission.submitted_at).toLocaleString('zh-CN')));
                const actions=el('div','review-actions');if(submission.status==='pending')actions.append(button('审核材料','secondary-button',()=>openReview(submission,task)));else{actions.append(el('strong','',submission.status==='approved'?'已通过':'已退回'));card.append(el('p','review-note',submission.review_note||''),el('p','dialog-meta','审核于 '+new Date(submission.reviewed_at).toLocaleString('zh-CN')));}card.append(actions);host.append(card);});
        } catch(error){host.replaceChildren(el('p','review-empty',error.message || '加载失败，请重试'));}
    }
    function openReview(submission,task) {
        const dialog=dialogBase('审核 · '+task.name);dialog.append(el('p','review-member',(submission.member_number?'序号 '+submission.member_number+' · ':'')+submission.user_name+' · '+submission.user_id),el('p','dialog-description',task.requirement),el('p','submitted-evidence',submission.evidence));
        const label=el('label','','审核意见（退回时必填）');label.htmlFor='review-note';const note=el('textarea','');note.id='review-note';note.maxLength=1000;note.rows=3;const error=el('p','submission-error');error.setAttribute('role','alert');const actions=el('div','review-actions');
        const dateLabel=el('label','','获得日期（审核通过时使用）');dateLabel.htmlFor='medal-award-date';
        const date=el('input');date.type='date';date.id='medal-award-date';date.required=true;date.min='1900-01-01';date.max=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});date.value=date.max;dialog.append(dateLabel,date);
        const approve=button('通过并点亮','primary-button',()=>review('approved'));const reject=button('退回补充','secondary-button',()=>review('rejected'));actions.append(reject,approve);dialog.append(label,note,error,actions);
        async function review(status){if(status==='approved' && !date.reportValidity())return;if(status==='rejected' && !note.value.trim()){error.textContent='请填写退回原因';return;}approve.disabled=reject.disabled=true;
            try {const data=await apiRequest('/api/admin/growth/'+encodeURIComponent(submission.user_id)+'/'+encodeURIComponent(task.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,reviewNote:note.value,...(status==='approved'?{awardDate:date.value}:{})})});if(currentProfile?.id===submission.user_id){currentProfile.growth=data.growth;render(currentProfile);}dialog.close();await loadReviews();notify('审核完成',status==='approved'?'徽章已为成员点亮':'材料已退回，成员可以补充后重新提交');}
            catch(e){error.textContent=e.message;}finally{approve.disabled=reject.disabled=false;}
        }dialog.showModal();
    }
    const designs=[['circuit','电路'],['code','程序'],['chip','芯片'],['signal','信号'],['exam','考核'],['project','项目'],['spark','星徽'],['search','调研'],['design','设计'],['shield','安全'],['medical','医疗'],['team','团队']];
    let editorBadges=[];
    async function loadBadgeEditor(host=document.getElementById('badge-editor-list')) {
        if(!host)return;host.replaceChildren(el('p','review-empty','正在加载徽章…'));
        try {
            const [growth,club]=await Promise.all([apiRequest('/api/admin/badge-catalog'),apiRequest('/api/admin/badges')]);
            editorBadges=[...club.badges.map(item=>({...item,source:'club'})),...growth.badges.map(item=>({...item,source:'growth'}))];
            host.replaceChildren();const actions=el('div','badge-editor-actions');actions.append(button('＋ 新增协会徽章','primary-button',()=>editBadge()));
            const search=el('input','badge-editor-search');search.type='search';search.placeholder='搜索徽章名称';search.setAttribute('aria-label','搜索徽章');actions.append(search);host.append(actions);const list=el('div','badge-editor-grid');host.append(list);
            function draw(){list.replaceChildren();editorBadges.filter(item=>item.name.toLowerCase().includes(search.value.toLowerCase().trim())).forEach(item=>{
                const card=el('article','badge-editor-card');card.append(medal(item.icon,true));const copy=el('div','badge-editor-copy');copy.append(el('span','section-kicker',item.source==='growth'?'成长任务':'协会荣誉'),el('strong','',item.name));card.append(copy,button('编辑','secondary-button',()=>editBadge(item)));card.append(button('\u5220\u9664','secondary-button',()=>deleteBadge(item)));list.append(card);
            });if(!list.children.length)list.append(el('p','review-empty','没有匹配的徽章'));}search.addEventListener('input',draw);draw();
            if(growth.deletedBadges?.length){const archive=el('details');archive.append(el('summary','','已删除成长勋章（'+growth.deletedBadges.length+'）'));for(const badge of growth.deletedBadges){const row=el('div','badge-editor-card');row.append(el('strong','',badge.name),button('恢复','secondary-button',async()=>{try{await apiRequest('/api/admin/badge-catalog/'+encodeURIComponent(badge.id)+'/restore',{method:'POST'});await loadBadgeEditor(host);if(currentProfile){const data=await apiRequest('/api/users/'+encodeURIComponent(currentProfile.id));if(data.user)render(data.user);}await loadReviews();}catch(e){notify('恢复失败',e.message);}}));archive.append(row);}host.append(archive);}

        } catch(error){host.replaceChildren(el('p','submission-error',error.message));host.append(button('重试','secondary-button',()=>loadBadgeEditor(host)));}
    }
    function deleteBadge(badge){
        const growth=badge.source==='growth';
        const dialog=dialogBase(growth?'删除成长勋章':'删除协会徽章');dialog.append(el('p','dialog-description',growth?'删除“'+badge.name+'”后，该任务将从所有成员的路线、图鉴及等级条件中移除。历史记录保留，可在工坊恢复。':'删除“'+badge.name+'”会同时移除所有成员的该徽章和授予记录。此操作无法撤销。'));
        const error=el('p','submission-error');error.setAttribute('role','alert');const remove=button('确认删除','secondary-button',async()=>{remove.disabled=true;try{await apiRequest(growth?'/api/admin/badge-catalog/'+encodeURIComponent(badge.id):'/api/admin/badges/'+encodeURIComponent(badge.name),{method:'DELETE'});dialog.close();await loadBadgeEditor();const legacy=document.getElementById('global-badges-list');if(legacy)await loadBadgeEditor(legacy);if(currentProfile){const result=await apiRequest('/api/users/'+encodeURIComponent(currentProfile.id));if(result.user)render(result.user);}await loadReviews();notify('已删除',growth?'成长勋章已移除':'协会徽章已移除');}catch(e){error.textContent=e.message;}finally{remove.disabled=false;}});
        dialog.append(error,button('取消','secondary-button',()=>dialog.close()),remove);dialog.showModal();
    }
    function editBadge(badge=null) {
        const dialog=dialogBase(badge?'编辑徽章':'新增协会徽章');const form=el('form','badge-edit-form');const preview=el('div','badge-design-preview');dialog.append(preview);
        function field(labelText,id,tag,value,max){const label=el('label','',labelText);label.htmlFor=id;const input=el(tag,'');input.id=id;input.required=true;input.value=value || '';if(max)input.maxLength=max;form.append(label,input);return input;}
        const name=field('徽章名称','badge-edit-name','input',badge?.name,100);name.type='text';
        const alias={cog:'circuit',bolt:'project','wave-square':'signal',lock:'shield',award:'spark'};
        const choice=field('徽章符号','badge-edit-icon','select','');designs.forEach(([value,label])=>{const option=el('option','',label);option.value=value;choice.append(option);});choice.value=alias[badge?.icon] || badge?.icon || 'spark';if(!choice.value)choice.value='spark';
        function updatePreview(){preview.replaceChildren(medal(choice.value,true));}choice.addEventListener('change',updatePreview);updatePreview();
        let requirement=null;if(badge?.source==='growth'){requirement=field('任务达成条件','badge-edit-requirement','textarea',badge.requirement,2000);requirement.rows=5;}
        form.append(el('p','dialog-meta',badge?'修改名称与符号会同步到成员图鉴，已获得状态和记录日期保留。':'新徽章会加入所有成员的图鉴，初始为未点亮；由管理员在成员管理中授予。'));
        const error=el('p','submission-error');error.setAttribute('role','alert');const save=el('button','primary-button','保存徽章');save.type='submit';form.append(error,save);dialog.append(form);
        form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;error.textContent='';
            const body={name:name.value.trim(),icon:choice.value};if(requirement)body.requirement=requirement.value.trim();
            const url=badge?.source==='growth'?'/api/admin/badge-catalog/'+encodeURIComponent(badge.id):'/api/admin/badges'+(badge?'/'+encodeURIComponent(badge.name):'');
            try {
                const data=await apiRequest(url,{method:badge?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
                if(badge?.source==='growth' && currentProfile){currentProfile.growth ||= {records:[],badgeDefinitions:[]};const overrides=currentProfile.growth.badgeDefinitions || [];currentProfile.growth.badgeDefinitions=[...overrides.filter(item=>item.id!==badge.id),data.badge];render(currentProfile);}
                else if(currentProfile){const data=await apiRequest('/api/users/'+encodeURIComponent(currentProfile.id));if(data.user)render(data.user);}
                dialog.close();await loadBadgeEditor();const legacy=document.getElementById('global-badges-list');if(legacy && !document.getElementById('badge-manage-section').classList.contains('hidden'))await loadBadgeEditor(legacy);notify('已保存','徽章已更新');
            }catch(e){error.textContent=e.message;}finally{save.disabled=false;}
        });dialog.showModal();
    }
    async function loadMemberMedals(userId) {
        const host=document.getElementById('member-growth-medals');
        host.dataset.userId=userId;host.replaceChildren(el('p','','正在加载成长勋章…'));
        try {
            const data=await apiRequest('/api/users/'+encodeURIComponent(userId)+'/growth');
            if(host.dataset.userId!==userId)return;
            if(typeof users!=='undefined' && users[userId])users[userId].growth=data.growth;
            host.replaceChildren(el('p','dialog-meta','授予或撤回会立即保存；下方“取消”仅取消个人资料与旧协会荣誉的编辑。等级随成长任务自动计算。'));
            for(const stage of catalog.stages){
                host.append(el('h3','',stage.name));
                for(const original of stage.tasks.filter(task=>!data.growth.archivedTaskIds?.includes(task.id))){
                    const task={...original,...data.growth.badgeDefinitions.find(item=>item.id===original.id)};
                    const record=data.growth.records.find(item=>item.taskId===task.id);const earned=record?.status==='approved';
                    const row=el('div','edit-badge-item');row.dataset.taskId=task.id;
                    const copy=el('div','badge-edit-info');copy.append(el('h4','',task.name),el('p','',stateNames[record?.status || 'locked']+(earned && record.approvedAt?' · '+(record.awardDate || new Date(record.approvedAt).toLocaleDateString('zh-CN')):'')));row.append(copy);
                    const action=button(earned?'撤回勋章':'授予勋章','secondary-button',()=>{
                        const dialog=dialogBase((earned?'撤回':'授予')+' · '+task.name);
                        dialog.append(el('p','dialog-description',task.requirement));
                        const dateLabel=el('label','form-group','获得日期');
                        const date=el('input');date.type='date';date.id='medal-award-date';date.required=true;date.min='1900-01-01';
                        date.max=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});date.value=record?.awardDate || date.max;dateLabel.htmlFor=date.id;dateLabel.append(date);
                        if(!earned)dialog.append(dateLabel);
                        const note=el('textarea');note.placeholder='填写操作说明';note.maxLength=1000;note.setAttribute('aria-label','操作说明');
                        const error=el('p','submission-error');error.setAttribute('role','alert');
                        const save=button('确认'+(earned?'撤回':'授予'),'primary-button',async()=>{
                            if(!earned && !date.reportValidity())return;
                            save.disabled=true;
                            try{const result=await apiRequest('/api/admin/members/'+encodeURIComponent(userId)+'/medals/'+encodeURIComponent(task.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({earned:!earned,reviewNote:note.value,...(!earned?{awardDate:date.value}:{})})});
                                if(typeof users!=='undefined' && users[userId])users[userId].growth=result.growth;
                                if(currentProfile?.id===userId){currentProfile.growth=result.growth;render(currentProfile);}
                                dialog.close();await loadMemberMedals(userId);notify('已保存',earned?'勋章已撤回':'勋章已授予');
                            }catch(e){error.textContent=e.message;}finally{save.disabled=false;}
                        });dialog.append(note,error,save);dialog.showModal();
                    });row.append(action);host.append(row);
                }
            }
        }catch(e){if(host.dataset.userId===userId)host.replaceChildren(el('p','submission-error',e.message),button('重试','secondary-button',()=>loadMemberMedals(userId)));}
    }
    document.addEventListener('DOMContentLoaded',()=>{
        const growthTab=document.getElementById('tab-growth');
        function showGrowth(){document.querySelectorAll('.tabs .tab').forEach(tab=>{tab.classList.toggle('active',tab===growthTab);tab.classList.toggle('inactive',tab!==growthTab);});for(const id of ['card-section','badges-section','admin-section','profile-edit-section','add-user-section','admin-edit-section'])document.getElementById(id)?.classList.add('hidden');document.getElementById('growth-section').classList.remove('hidden');}
        growthTab?.addEventListener('click',showGrowth);document.getElementById('open-growth-route')?.addEventListener('click',showGrowth);
        for(const id of ['tab-card','tab-badges','tab-admin'])document.getElementById(id)?.addEventListener('click',()=>{document.getElementById('growth-section')?.classList.add('hidden');growthTab?.classList.remove('active');growthTab?.classList.add('inactive');if(id==='tab-admin'){loadReviews();loadBadgeEditor();}});
        document.getElementById('refresh-growth')?.addEventListener('click',refresh);document.getElementById('refresh-growth-reviews')?.addEventListener('click',loadReviews);
    });
    return {render,refresh,loadReviews,loadBadgeEditor,editBadge,loadMemberMedals};
})();
