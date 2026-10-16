(function(root, factory) {
    const catalog = factory();
    if (typeof module === 'object' && module.exports) module.exports = catalog;
    else root.GrowthCatalog = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';
    const stages = [
        { id:'foundation', name:'初阶', subtitle:'从第一块电路开始', version:'卓工 1.0', description:'完成初阶课程学习并通过考核，建立硬件与编程基础。', tasks:[
            ['circuit','电路设计与制作','完成电路设计与制作课程，提交设计文件或实物测试记录。','circuit'],
            ['c-language','C 语言程序设计','完成 C 语言课程，提交课程作业或程序运行记录。','code'],
            ['mcu-51','51 单片机入门','完成 51 单片机入门课程，提交实验或项目记录。','chip'],
            ['mcu-32','32 位单片机基础','完成 32 位单片机基础课程，提交实验记录。','chip'],
            ['foundation-exam','初阶课程考核','完成初阶课程学习并通过考核，提交考核结果。','exam']
        ]},
        { id:'medical', name:'中阶', subtitle:'让技术读懂生命信号', version:'卓工 1.0', description:'掌握医疗电子与多参数监护技术，独立设计并实现至少 3 个人体生理参数的监护系统。', tasks:[
            ['medical-electronics','医学电子学','完成医学电子学课程，提交实验或考核材料。','circuit'],
            ['medical-signals','医学信号处理','完成医学信号处理课程，提交信号处理实验记录。','signal'],
            ['medical-software','医用仪器软件设计','完成医用仪器软件设计课程，提交软件设计材料。','code'],
            ['monitor-hardware','多参监护硬件系统','完成多参数监护硬件系统设计，提交硬件文件及验证记录。','circuit'],
            ['monitor-algorithms','多参监护嵌入式算法','完成多参数监护嵌入式算法，提交算法及验证记录。','signal'],
            ['monitor-desktop','多参监护上位机软件','完成多参数监护上位机软件，提交界面或测试记录。','code'],
            ['three-parameter-system','三参数监护系统','独立设计并实现至少 3 个人体生理参数的监护系统，提交说明与演示。','project']
        ]},
        { id:'advanced', name:'高阶', subtitle:'拓宽工程能力的边界', version:'卓工 2.0', description:'学习嵌入式系统、操作系统与 AI 工具，为产品开发准备技术能力。', tasks:[
            ['advanced-mcu','单片机高阶','完成单片机高阶学习，提交课程成果。','chip'],
            ['microprocessor','微机原理','完成微机原理学习，提交实验或考核记录。','chip'],
            ['rtos','实时操作系统','完成实时操作系统学习，提交调度或系统实验。','code'],
            ['linux','Linux 基础开发','完成 Linux 基础开发学习，提交开发成果。','code'],
            ['ai-tools','AI 工具基础','完成 AI 工具基础学习，提交工具应用案例。','spark']
        ]},
        { id:'prototype', name:'准产品', subtitle:'把想法变成可以验证的设计', version:'卓工 2.0', description:'完成从项目调研到设计输出的完整开发流程。', tasks:[
            ['research','项目调研与立项','完成需求调研与项目立项，提交调研报告或立项文件。','search'],
            ['hardware-design','硬件开发设计','完成硬件开发设计，提交设计文件与说明。','circuit'],
            ['software-design','软件开发设计','完成软件开发设计，提交设计文件与说明。','code'],
            ['industrial-design','ID 与 MD 设计开发','完成工业设计与机械设计开发，提交模型或设计图。','design'],
            ['design-output','设计输出','完成设计输出，提交完整设计资料。','project']
        ]},
        { id:'product', name:'常规产品', subtitle:'走完研发，承担团队责任', version:'卓工 2.0', description:'完成产品研发与结项，同时展示技术、组织管理、公众演讲及团队服务能力。', tasks:[
            ['experimental-system','实验系统','完成实验系统，提交系统测试记录。','signal'],
            ['principle-prototype','原理样机','完成原理样机，提交验证记录。','project'],
            ['engineering-prototype','工程样机','完成工程样机，提交工程设计与测试材料。','project'],
            ['safety-testing','功能及安全性测试','完成功能及安全性测试，提交测试报告。','shield'],
            ['preclinical','临床前试验','完成临床前试验相关工作，提交相应记录。','medical'],
            ['product-close','产品结项','完成产品结项，提交结项成果。','exam'],
            ['two-products','两项研发成果','至少完成 2 个准产品或产品的研发，提交项目成果及个人贡献说明。','project'],
            ['team-service','团队建设与服务','承担授课、组织活动等服务工作，提交服务记录。','team'],
            ['multidimensional','多维能力展示','展示技术、组织管理与公众演讲能力，提交相应成果或记录。','spark']
        ]},
        { id:'innovation', name:'创新产品 / 创业', subtitle:'让医工创新走向真实世界', version:'卓工 3.0', description:'探索医工融合创新创业，并在重要项目与协会管理中承担领导责任。', tasks:[
            ['innovation-camp','医疗科创训练营','完成医疗科创训练营，提交学习或结业记录。','medical'],
            ['needs-discovery','探索 · 需求发现与筛选','完成需求发现与筛选，提交需求分析报告。','search'],
            ['poc','POC · 产品立项','完成 POC 阶段的产品立项，提交立项成果。','project'],
            ['evt','EVT · 工程样机开发','完成 EVT 阶段工程样机开发，提交开发材料。','circuit'],
            ['dvt','DVT · 集成测试检测','完成 DVT 阶段集成测试检测，提交检测记录。','shield'],
            ['ct','CT · 临床试验','完成 CT 阶段临床试验相关工作，提交相应记录。','medical'],
            ['ptv','PTV · 小批量试产','完成 PTV 阶段小批量试产，提交试产材料。','project'],
            ['mdr','MDR · 医疗器械注册','完成 MDR 阶段医疗器械注册相关工作，提交相关成果。','shield'],
            ['mp','MP · 产品上市销售','完成 MP 阶段产品上市销售，提交相应成果。','spark'],
            ['project-leadership','主持重要项目','至少主持过 1 个重要项目，对项目有深刻理解和显著贡献，提交项目与贡献材料。','team'],
            ['club-leadership','协会管理与领导力','在协会管理层担任过职位，展现领导力和决策能力，提交任职及工作成果。','team']
        ]}
    ].map((stage,index)=>({...stage,index,tasks:stage.tasks.map(([key,name,requirement,icon])=>({id:stage.id+'-'+key,name,requirement,icon,stageId:stage.id}))}));
    const tasks = stages.flatMap(stage=>stage.tasks);
    const ranks = [
        {id:'junior',name:'初级工程师',short:'初级',through:0,tone:'graphite'},
        {id:'intermediate',name:'中级工程师',short:'中级',through:1,tone:'bronze'},
        {id:'senior',name:'高级工程师',short:'高级',through:4,tone:'silver'},
        {id:'excellent',name:'卓越工程师',short:'卓越',through:5,tone:'gold'}
    ];
    function summarize(records=[], archivedTaskIds=[]) {
        const archived=new Set(archivedTaskIds);
        const activeStages=stages.map(stage=>({...stage,tasks:stage.tasks.filter(task=>!archived.has(task.id))}));
        const activeTasks=activeStages.flatMap(stage=>stage.tasks);
        const approved = new Set(records.filter(record=>record.status==='approved').map(record=>record.taskId || record.task_id));
        const pending = new Set(records.filter(record=>record.status==='pending').map(record=>record.taskId || record.task_id));
        const stageProgress = activeStages.map(stage=>({...stage,completed:stage.tasks.filter(task=>approved.has(task.id)).length,total:stage.tasks.length}));
        const rankProgress = ranks.map(rank=>{
            const required = activeStages.filter(stage=>stage.index<=rank.through).flatMap(stage=>stage.tasks);
            const completed = required.filter(task=>approved.has(task.id)).length;
            return {...rank,completed,total:required.length,unlocked:required.length>0 && completed===required.length};
        });
        return {approved:activeTasks.filter(task=>approved.has(task.id)).length,pending:activeTasks.filter(task=>pending.has(task.id)).length,total:activeTasks.length,stages:stageProgress,ranks:rankProgress,currentStage:stageProgress.find(stage=>stage.completed<stage.total)?.id || stages.at(-1).id,currentRank:rankProgress.filter(rank=>rank.unlocked).at(-1)?.name || '成长起点'};
    }
    return {stages,tasks,ranks,summarize};
});