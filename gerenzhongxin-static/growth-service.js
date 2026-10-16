'use strict';
const catalog = require('./growth-catalog');
const schema = `CREATE TABLE IF NOT EXISTS growth_submissions (
    user_id VARCHAR(50) NOT NULL,
    task_id VARCHAR(100) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    evidence TEXT NOT NULL,
    review_note TEXT,
    reviewed_by VARCHAR(50),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    award_date DATE NULL,
    PRIMARY KEY (user_id, task_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`;
const badgeSchema = `CREATE TABLE IF NOT EXISTS growth_badge_definitions (
 task_id VARCHAR(100) PRIMARY KEY, name VARCHAR(100) NOT NULL,
 requirement TEXT NOT NULL, icon VARCHAR(40) NOT NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)`;
const badgeIcons=['circuit','code','chip','signal','exam','project','spark','search','design','shield','medical','team'];
const archiveSchema = `CREATE TABLE IF NOT EXISTS growth_archived_tasks (task_id VARCHAR(100) PRIMARY KEY, deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
function awardDateValue(value) {
    const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
    const date=value===undefined?today:value;
    if(typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date<'1900-01-01' || date>today || Number.isNaN(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)return null;
    return date;
}
function createGrowthService(query) {
    async function archivedIds(){return (await query('SELECT task_id FROM growth_archived_tasks')).map(row=>row.task_id);}
    async function activeTask(id){return !(await archivedIds()).includes(id);}
    async function definitions() {
        const rows=await query('SELECT task_id, name, requirement, icon FROM growth_badge_definitions');
        return rows.filter(row=>catalog.tasks.some(task=>task.id===row.task_id)).map(row=>({id:row.task_id,name:row.name,requirement:row.requirement,icon:row.icon}));
    }
    const validTask = id => catalog.tasks.some(task=>task.id===id);
    async function profile(userId, privateView=false) {
        const rows = await query('SELECT task_id, status, evidence, review_note, submitted_at, reviewed_at, award_date FROM growth_submissions WHERE user_id = ?', [userId]);
        const archivedTaskIds=await archivedIds();
        const records = rows.filter(row=>!archivedTaskIds.includes(row.task_id)).filter(row=>privateView || row.status==='approved').map(row=>({
            taskId:row.task_id,status:row.status,approvedAt:row.status==='approved'?row.reviewed_at:null,
            awardDate:row.status==='approved'?(row.award_date instanceof Date?row.award_date.toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}):row.award_date || null):null,
            ...(privateView?{evidence:row.evidence,reviewNote:row.review_note || '',submittedAt:row.submitted_at}:{})
        }));
        const summary = catalog.summarize(records,archivedTaskIds);
        return {records,archivedTaskIds,badgeDefinitions:await definitions(),approved:summary.approved,pending:summary.pending,total:summary.total,currentRank:summary.currentRank};
    }
    function register(app) {
        app.put('/api/admin/members/:userId/medals/:taskId', async(req,res)=>{
            const {userId,taskId}=req.params;const {earned,reviewNote='',awardDate}=req.body;
            if(!validTask(taskId))return res.status(404).json({success:false,message:'勋章不存在'});
            if(typeof earned!=='boolean' || typeof reviewNote!=='string' || reviewNote.length>1000)return res.status(400).json({success:false,message:'勋章操作信息无效'});
            const date=awardDateValue(awardDate);
            if(earned && !date)return res.status(400).json({success:false,message:'请选择有效的获得日期，不能晚于今天'});
            try {
                if(!await activeTask(taskId))return res.status(404).json({success:false,message:'该成长勋章已删除'});
                const users=await query('SELECT id FROM users WHERE id = ?',[userId]);
                if(!users.length)return res.status(404).json({success:false,message:'成员不存在'});
                const status=earned?'approved':'rejected';const note=reviewNote.trim() || (earned?'管理员直接授予':'管理员撤回勋章，请补充材料后重新提交');
                await query(`INSERT INTO growth_submissions (user_id, task_id, status, evidence, review_note, reviewed_by, reviewed_at, award_date)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
                    ON DUPLICATE KEY UPDATE status = VALUES(status), review_note = VALUES(review_note), reviewed_by = VALUES(reviewed_by), reviewed_at = CURRENT_TIMESTAMP, award_date = VALUES(award_date)`,
                    [userId,taskId,status,'管理员管理成长勋章',note,req.session.userId,earned?date:null]);
                res.json({success:true,growth:await profile(userId,true)});
            }catch {res.status(500).json({success:false,message:'勋章保存失败，请重试'});}
        });
        app.delete('/api/admin/badge-catalog/:taskId',async(req,res)=>{
            if(!validTask(req.params.taskId))return res.status(404).json({success:false,message:'勋章不存在'});
            try{await query('INSERT IGNORE INTO growth_archived_tasks (task_id) VALUES (?)',[req.params.taskId]);res.json({success:true});}
            catch{res.status(500).json({success:false,message:'删除失败，请重试'});}
        });
        app.post('/api/admin/badge-catalog/:taskId/restore',async(req,res)=>{
            if(!validTask(req.params.taskId))return res.status(404).json({success:false,message:'勋章不存在'});
            try{await query('DELETE FROM growth_archived_tasks WHERE task_id = ?',[req.params.taskId]);res.json({success:true});}
            catch{res.status(500).json({success:false,message:'恢复失败，请重试'});}
        });
        app.get('/api/admin/badge-catalog', async(req,res)=>{
            try {const overrides=await definitions(),archived=await archivedIds();const all=catalog.tasks.map(task=>({...task,...overrides.find(item=>item.id===task.id)}));res.json({success:true,badges:all.filter(task=>!archived.includes(task.id)),deletedBadges:all.filter(task=>archived.includes(task.id))});}
            catch {res.status(500).json({success:false,message:'无法加载徽章目录'});}
        });
        app.put('/api/admin/badge-catalog/:taskId', async(req,res)=>{
            const {taskId}=req.params;const {name,requirement,icon}=req.body;
            if(!validTask(taskId))return res.status(404).json({success:false,message:'徽章不存在'});
            if(typeof name!=='string' || !name.trim() || name.length>100 || typeof requirement!=='string' || !requirement.trim() || requirement.length>2000 || !badgeIcons.includes(icon))return res.status(400).json({success:false,message:'请填写名称、达成条件并选择徽章造型'});
            try {if(!await activeTask(taskId))return res.status(404).json({success:false,message:'该成长勋章已删除'});await query('INSERT INTO growth_badge_definitions (task_id, name, requirement, icon) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), requirement = VALUES(requirement), icon = VALUES(icon)',[taskId,name.trim(),requirement.trim(),icon]);res.json({success:true,badge:{id:taskId,name:name.trim(),requirement:requirement.trim(),icon}});}
            catch {res.status(500).json({success:false,message:'保存失败，修改内容已保留'});}
        });
        // Authentication is supplied by the existing /api/users and /api/admin middleware.
        app.get('/api/users/:userId/growth', async (req,res)=>{
            if (req.session.userId!==req.params.userId && req.session.userId!=='admin') return res.status(403).json({success:false,message:'无法查看其他成员的提交记录'});
            try {
                const users = await query('SELECT id FROM users WHERE id = ?', [req.params.userId]);
                if (!users.length) return res.status(404).json({success:false,message:'成员不存在'});
                res.json({success:true,growth:await profile(req.params.userId,true)});
            } catch(error) { res.status(500).json({success:false,message:'无法加载成长进度，请稍后重试'}); }
        });
        app.post('/api/users/:userId/growth/:taskId', async (req,res)=>{
            const {userId,taskId}=req.params;
            if (req.session.userId!==userId) return res.status(403).json({success:false,message:'只能提交自己的任务'});
            if (!validTask(taskId)) return res.status(404).json({success:false,message:'任务不存在'});
            if (typeof req.body.evidence!=='string' || req.body.evidence.trim().length<10 || req.body.evidence.length>2000) return res.status(400).json({success:false,message:'请填写 10–2000 字的完成说明，可附作品或证明链接'});
            try {
                if(!await activeTask(taskId))return res.status(404).json({success:false,message:'该成长勋章已删除'});
                const rows=await query('SELECT status FROM growth_submissions WHERE user_id = ? AND task_id = ?',[userId,taskId]);
                if (rows.length && rows[0].status!=='rejected') return res.status(409).json({success:false,message:rows[0].status==='approved'?'此任务已通过审核':'此任务已提交，请等待审核'});
                // Conditional updates prevent overwriting an approval or concurrent submission.
                const result=rows.length
                    ? await query("UPDATE growth_submissions SET status = 'pending', evidence = ?, review_note = NULL, reviewed_by = NULL, reviewed_at = NULL, award_date = NULL, submitted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND task_id = ? AND status = 'rejected'",[req.body.evidence.trim(),userId,taskId])
                    : await query("INSERT IGNORE INTO growth_submissions (user_id, task_id, status, evidence) VALUES (?, ?, 'pending', ?)",[userId,taskId,req.body.evidence.trim()]);
                if (!result.affectedRows) return res.status(409).json({success:false,message:'状态已更新，请刷新后重试'});
                res.json({success:true,growth:await profile(userId,true)});
            } catch(error) { res.status(500).json({success:false,message:'提交失败，请稍后重试'}); }
        });
        app.get('/api/admin/growth/submissions', async (req,res)=>{
            try {
                const status=req.query.status || 'pending';
                if(!['pending','approved','rejected'].includes(status))return res.status(400).json({success:false,message:'审核状态无效'});
                const submissions=await query("SELECT g.*, u.name AS user_name FROM growth_submissions g JOIN users u ON u.id = g.user_id WHERE g.status = ? ORDER BY g.submitted_at ASC",[status]);
                const archived=await archivedIds();
                const members=await query('SELECT id FROM users ORDER BY created_at ASC, id ASC');
                const numbers=new Map(members.filter(user=>user.id!=='admin').map((user,index)=>[user.id,index+1]));
                res.json({success:true,submissions:submissions.filter(row=>!archived.includes(row.task_id)).map(row=>({...row,member_number:numbers.get(row.user_id)}))});
            } catch(error) {res.status(500).json({success:false,message:'无法加载待审核任务'});}
        });
        app.put('/api/admin/growth/:userId/:taskId', async (req,res)=>{
            const {userId,taskId}=req.params;
            const {status,reviewNote='',awardDate}=req.body;
            if (!validTask(taskId) || !['approved','rejected'].includes(status) || typeof reviewNote!=='string' || reviewNote.length>1000) return res.status(400).json({success:false,message:'审核信息无效'});
            const date=awardDateValue(awardDate);
            if(status==='approved' && !date)return res.status(400).json({success:false,message:'请选择有效的获得日期，不能晚于今天'});
            if (status==='rejected' && !reviewNote.trim()) return res.status(400).json({success:false,message:'请填写退回原因，帮助成员完善材料'});
            try {
                if(!await activeTask(taskId))return res.status(404).json({success:false,message:'该成长勋章已删除'});
                const result=await query("UPDATE growth_submissions SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, award_date = ? WHERE user_id = ? AND task_id = ? AND status = 'pending'",[status,reviewNote.trim(),req.session.userId,status==='approved'?date:null,userId,taskId]);
                if (!result.affectedRows) return res.status(409).json({success:false,message:'任务已审核或不存在，请刷新列表'});
                res.json({success:true,growth:await profile(userId,true)});
            } catch(error) {res.status(500).json({success:false,message:'审核失败，请稍后重试'});}
        });
    }
    return {profile,register,initialize:async()=>{
        await query(schema);await query(badgeSchema);await query(archiveSchema);
        const columns=await query("SHOW COLUMNS FROM growth_submissions LIKE 'award_date'");
        if(!columns.length)await query('ALTER TABLE growth_submissions ADD COLUMN award_date DATE NULL');
    }};
}
module.exports={createGrowthService,schema,badgeSchema};
