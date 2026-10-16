const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const bcrypt = require('bcrypt');
const root = path.resolve(__dirname, '..');
const passwordHash = bcrypt.hashSync('test-password', 4);
const profiles = {
    user1: { id:'user1', name:'林卓越', title:'嵌入式硬件工程师', organization:'深圳大学医工融合卓越工程师协会', major:'生物医学工程', email:'lin@example.com', github:'github.com/example', quote:'以技术回应真实需求。', bio:'探索医工交叉领域，专注于生物医学信号处理与嵌入式系统设计。希望通过技术创新解决临床实际痛点，做一名有温度的工程师。', avatar:'/avatar.svg', badges:[] },
    user2: { id:'user2', name:'另一位成员' },
    admin: { id:'admin', name:'管理员' }
};
const growthRecords = new Map();
const badgeDefinitions=new Map();
const awardRows=Object.keys(profiles).flatMap(user_id=>[{user_id,name:'PCB 绘图入门',date:'2024.10.15',icon:'cog',unlocked:1},{user_id,name:'3D 打印实战',date:'2024.11.02',icon:'bolt',unlocked:1},{user_id,name:'临床需求调研',date:'LOCKED',icon:'lock',unlocked:0}]);
const key = (userId,taskId) => userId + ":" + taskId;
const db = { testConnection: async () => false, query: async (sql, args=[]) => {
    if (sql.includes('FROM growth_submissions g JOIN')) return [...growthRecords.values()].filter(row=>row.status===(args[0] || 'pending')).map(row=>({...row,user_name:profiles[row.user_id].name}));
    if (sql.startsWith('SELECT') && sql.includes('FROM growth_submissions')) return [...growthRecords.values()].filter(row=>row.user_id===args[0] && (!args[1] || row.task_id===args[1])).map(row=>({...row}));
    if (sql.startsWith('INSERT IGNORE INTO growth_submissions')) {
        const id=key(args[0],args[1]);if(growthRecords.has(id))return {affectedRows:0};
        growthRecords.set(id,{user_id:args[0],task_id:args[1],status:'pending',evidence:args[2],submitted_at:new Date().toISOString(),reviewed_at:null});return {affectedRows:1};
    }
    if (sql.startsWith('UPDATE growth_submissions SET status = \'pending\'')) {
        const row=growthRecords.get(key(args[1],args[2]));if(!row || row.status!=='rejected')return {affectedRows:0};
        Object.assign(row,{status:'pending',evidence:args[0],review_note:null,reviewed_by:null,reviewed_at:null,submitted_at:new Date().toISOString()});return {affectedRows:1};
    }
    if (sql.startsWith('UPDATE growth_submissions SET status = ?')) {
        const row=growthRecords.get(key(args[3],args[4]));if(!row || row.status!=='pending')return {affectedRows:0};
        Object.assign(row,{status:args[0],review_note:args[1],reviewed_by:args[2],reviewed_at:new Date().toISOString()});return {affectedRows:1};
    }
    if(sql.startsWith('SELECT') && sql.includes('FROM growth_badge_definitions'))return [...badgeDefinitions.values()].map(row=>({...row}));
    if(sql.startsWith('INSERT INTO growth_badge_definitions')){badgeDefinitions.set(args[0],{task_id:args[0],name:args[1],requirement:args[2],icon:args[3]});return {affectedRows:1};}
    if(sql.startsWith('INSERT INTO badges')){awardRows.push({user_id:args[0],name:args[1],date:args[2],icon:args[3],unlocked:args[4]});return {affectedRows:1};}
    if(sql.startsWith('UPDATE badges SET name')){let affectedRows=0;awardRows.forEach(row=>{if(row.name===args[2]){row.name=args[0];row.icon=args[1];affectedRows++;}});return {affectedRows};}
    if(sql.startsWith('DELETE FROM badges WHERE name')){for(let i=awardRows.length-1;i>=0;i--)if(awardRows[i].name===args[0])awardRows.splice(i,1);return {affectedRows:1};}
    if (sql.includes('FROM credentials')) return profiles[args[0]] ? [{password_hash:passwordHash}] : [];
    if (sql.includes('FROM badges')) {
        if(sql.includes('DISTINCT')){const rows=sql.includes('WHERE name = ?')?awardRows.filter(row=>row.name===args[0]):awardRows;return [...new Map(rows.map(row=>[row.name,{name:row.name,icon:row.icon}])).values()];}
        return awardRows.filter(row=>row.user_id===args[0]).map(row=>({...row}));
    }
    if (sql.includes('FROM users')) return args.length ? (profiles[args[0]] ? [{...profiles[args[0]]}] : []) : Object.values(profiles);
    return [];
}};
function createApp() {
    const source = fs.readFileSync(path.join(root,'server.js'),'utf8').split('// 启动服务器')[0] + '\nmodule.exports = { app, encrypt, cleanupTimer };';
    const sandbox = { require: name => name === './db' ? db : require(name.startsWith('./') ? path.join(root,name) : name), __dirname: root, process, console:{log(){},warn(){},error(){}}, Buffer, setInterval, clearInterval, module:{exports:{}} };
    vm.runInNewContext(source,sandbox,{filename:path.join(root,'server.js')});
    return sandbox.module.exports;
}
module.exports = {createApp,profiles,growthRecords,badgeDefinitions,awardRows};