const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool, testConnection, query } = require('./db');

const profileFields=require('./profile-fields');
const { createGrowthService } = require('./growth-service');
const growthService = createGrowthService(query);
const collaborationService=require('./collaboration-service').create(query);
const nfcService=require('./nfc-service').createNfcService(query,encrypt);
const app = express();
const PORT = Number(process.env.PORT || 3002);

// 加密密钥（32字节，用于AES-256）
// Keep the legacy key only for existing NFC links; configure a 32-byte key for new installations.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'nfc_web_secure_key_2026_32bytes!';
const encryptionKey = Buffer.from(ENCRYPTION_KEY);
if (process.env.ENCRYPTION_KEY && encryptionKey.length !== 32) throw new Error('ENCRYPTION_KEY must contain exactly 32 bytes');
const IV_LENGTH = 16;

// 加密函数
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', (encryptionKey.length === 32 ? encryptionKey : crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// 解密函数
function decrypt(text) {
    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = Buffer.from(parts[1], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', (encryptionKey.length === 32 ? encryptionKey : crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()), iv);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        return null;
    }
}

// 中间件
app.disable('x-powered-by');
app.use(bodyParser.json({ limit: '2mb' }));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
});
// Serve only intentional public assets, never database exports or server source.
for (const file of ['collaboration-ui.js', 'contact-ui.js', 'contact.css', 'nfc-tool.html', 'nfc-tool.js', 'nfc-tool.css', 'index.html', '404.html', 'styles.css', 'ui.js', 'avatar.svg', 'club-logo.png', 'growth-catalog.js', 'growth-ui.js', 'growth.css', 'api-client.js', 'title-picker.js', 'member-import.js', 'member-import-ui.js', 'medal-art.js', 'badge-cabinet.js', 'badge-viewer.js', 'cabinet.css']) {
    app.get(file === 'index.html' ? ['/', '/index.html'] : '/' + file,
        (req, res) => res.sendFile(path.join(__dirname, file)));
}
app.get('/medal-assets/:file',(req,res)=>{
    if(!/^(?:medal-[a-z]+|mount)-[a-f0-9]{12}\.(?:png|webp)$/.test(req.params.file))return res.sendStatus(404);
    res.sendFile(path.join(__dirname,'medal-assets',req.params.file),{maxAge:'1y',immutable:true});
});
const sessions = new Map();
const attempts = new Map();
const oauthStates = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000;
function requireSession(req, res, next) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const session = sessions.get(token);
    if (!session || session.expires <= Date.now()) {
        sessions.delete(token);
        return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
    }
    req.session = session;
    next();
}
app.post('/api/logout', requireSession, (req, res) => {
    sessions.delete((req.headers.authorization || '').replace(/^Bearer /, ''));
    res.json({ success: true });
});
app.use('/api/admin', requireSession, (req, res, next) => {
    if (req.session.userId !== 'admin') return res.status(403).json({ success: false, message: '需要管理员权限' });
    next();
});
app.use('/api/users/:userId', (req, res, next) => {
    // NFC cards are public through /user/:encryptedUserId; account data requires a session.
    requireSession(req, res, () => {
        if (req.method !== 'GET' && req.session.userId !== req.params.userId && req.session.userId !== 'admin') {
            return res.status(403).json({ success: false, message: '无法修改其他用户的资料' });
        }
        next();
    });
});
app.use('/api/change-password', requireSession, (req, res, next) => {
    if (req.body.username !== req.session.userId) return res.status(403).json({ success: false, message: '无法修改其他用户的密码' });
    next();
});
app.use('/api/encrypt-user-id/:userId', requireSession, (req, res, next) => {
    if (req.session.userId !== req.params.userId && req.session.userId !== 'admin') return res.status(403).json({ success: false, message: '无法获取其他用户的分享链接' });
    next();
});
app.use('/api/collaboration',requireSession);
app.use('/api/feishu/status/:userId', requireSession);
app.use('/api/feishu/unbind/:userId', requireSession, (req, res, next) => {
    if (req.session.userId !== req.params.userId) return res.status(403).json({ success: false, message: '无法解绑其他用户' });
    next();
});
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
    for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
    for (const [key, value] of oauthStates) if (value.expires <= now) oauthStates.delete(key);
}, 60000);
cleanupTimer.unref();


growthService.register(app);

// 初始化数据
async function initializeData() {
    try {
        // 测试数据库连接
        const connected = await testConnection();
        if (!connected) {
            console.error('数据库连接失败，无法初始化数据');
            return;
        }
        
        await growthService.initialize();
        await profileFields.initialize(query);
        await nfcService.initialize();
        await collaborationService.initialize();
        await require('./account-migration').migrate(pool);

        // 自动迁移：检查 student_id 列是否存在，不存在则添加
        try {
            const columns = await query("SHOW COLUMNS FROM users LIKE 'student_id'");
            if (columns.length === 0) {
                await query("ALTER TABLE users ADD COLUMN student_id VARCHAR(20) DEFAULT '' AFTER name");
                console.log('数据库迁移：已添加 student_id 列');
            }
        } catch (migrateErr) {
            console.error('数据库迁移失败:', migrateErr);
        }

        // 自动迁移：检查 feishu_link 列是否存在，不存在则添加
        try {
            const columns = await query("SHOW COLUMNS FROM users LIKE 'feishu_link'");
            if (columns.length === 0) {
                await query("ALTER TABLE users ADD COLUMN feishu_link VARCHAR(500) DEFAULT '' AFTER github");
                console.log('数据库迁移：已添加 feishu_link 列');
            }
        } catch (migrateErr) {
            console.error('数据库迁移失败:', migrateErr);
        }

        // 自动迁移：检查 feishu_open_id 列是否存在，不存在则添加（用于 OAuth 绑定）
        try {
            const columns = await query("SHOW COLUMNS FROM users LIKE 'feishu_open_id'");
            if (columns.length === 0) {
                await query("ALTER TABLE users ADD COLUMN feishu_open_id VARCHAR(100) DEFAULT '' AFTER feishu_link");
                console.log('数据库迁移：已添加 feishu_open_id 列');
            }
        } catch (migrateErr) {
            console.error('数据库迁移失败:', migrateErr);
        }

        // 自动迁移：检查 feishu_avatar 列是否存在，不存在则添加（存储飞书头像）
        try {
            const columns = await query("SHOW COLUMNS FROM users LIKE 'feishu_avatar'");
            if (columns.length === 0) {
                await query("ALTER TABLE users ADD COLUMN feishu_avatar VARCHAR(500) DEFAULT '' AFTER feishu_open_id");
                console.log('数据库迁移：已添加 feishu_avatar 列');
            }
        } catch (migrateErr) {
            console.error('数据库迁移失败:', migrateErr);
        }

        // 自动迁移：检查 encrypted_id 列是否存在，不存在则添加（存储固定的加密用户ID）
        try {
            const columns = await query("SHOW COLUMNS FROM users LIKE 'encrypted_id'");
            if (columns.length === 0) {
                await query("ALTER TABLE users ADD COLUMN encrypted_id VARCHAR(300) DEFAULT '' AFTER feishu_avatar");
                console.log('数据库迁移：已添加 encrypted_id 列');
            }
            // 为所有 encrypted_id 为空的用户生成固定加密ID
            const usersNeedingId = await query("SELECT id FROM users WHERE encrypted_id IS NULL OR encrypted_id = ''");
            for (const u of usersNeedingId) {
                const encId = encrypt(u.id);
                await query("UPDATE users SET encrypted_id = ? WHERE id = ?", [encId, u.id]);
            }
            if (usersNeedingId.length > 0) {
                console.log(`数据库迁移：已为 ${usersNeedingId.length} 个用户生成固定加密ID`);
            }
        } catch (migrateErr) {
            console.error('数据库迁移失败:', migrateErr);
        }

        // 自动迁移：将 avatar 列改为 MEDIUMTEXT 以支持 base64 头像
        try {
            const columns = await query("SHOW COLUMNS FROM users LIKE 'avatar'");
            if (columns.length > 0 && columns[0].Type.toUpperCase() !== 'MEDIUMTEXT') {
                await query("ALTER TABLE users MODIFY COLUMN avatar MEDIUMTEXT DEFAULT ''");
                console.log('数据库迁移：avatar 列已改为 MEDIUMTEXT');
            }
        } catch (migrateErr) {
            console.error('数据库迁移失败:', migrateErr);
        }
        
        // 检查users表是否有数据
        const users = await query('SELECT * FROM users');
        if (users.length === 0) {
            // 初始化默认用户
            const defaultUsers = {
                'user1': {
                    id: 'user1',
                    name: '林 卓 越',
                    title: '嵌入式硬件工程师',
                    organization: '深圳大学医工融合卓越工程师协会',
                    major: '生物医学工程 (2022级)',
                    email: 'lin.eng@szu.edu.cn',
                    phone: '13800138001',
                    wechat: 'linzhuoyue_wechat',
                    github: 'github.com/med-eng-dev',
                    quote: '致力于医疗器械小型化与可穿戴设备的创新设计。PCB Artist & Code Poet.',
                    bio: '热衷于探索医工交叉领域的前沿技术，专注于生物医学信号处理与嵌入式系统设计。曾参与多项国家级大学生创新训练项目，擅长PCB设计与3D建模。希望通过技术创新解决临床实际痛点，做一名有温度的工程师。',
                    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=cartoon%20avatar%20of%20a%20happy%20young%20woman%20with%20brown%20hair%20wearing%20a%20black%20shirt&image_size=square',
                    badges: [
                        { name: 'PCB绘图入门', date: '2024.10.15', icon: 'cog', unlocked: true },
                        { name: '3D打印实战', date: '2024.11.02', icon: 'bolt', unlocked: true },
                        { name: '生理信号处理', date: '2025.01.10', icon: 'wave-square', unlocked: true },
                        { name: '医疗法规培训', date: 'LOCKED', icon: 'lock', unlocked: false },
                        { name: '临床需求调研', date: 'LOCKED', icon: 'lock', unlocked: false },
                        { name: '年度卓越项目', date: 'LOCKED', icon: 'lock', unlocked: false }
                    ]
                },
                'user2': {
                    id: 'user2',
                    name: '张 科 技',
                    title: '软件工程师',
                    organization: '深圳大学医工融合卓越工程师协会',
                    major: '计算机科学与技术 (2021级)',
                    email: 'zhang.tech@szu.edu.cn',
                    phone: '13900139001',
                    wechat: 'zhangkeji_wechat',
                    github: 'github.com/tech-dev',
                    quote: '专注于医疗软件系统开发，追求代码的优雅与效率。',
                    bio: '热爱编程，擅长前端和后端开发，致力于将技术与医疗相结合，开发实用的医疗软件系统。曾参与多个医疗相关的软件开发项目，希望通过技术为医疗行业带来创新。',
                    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=cartoon%20avatar%20of%20a%20young%20man%20with%20glasses%20and%20short%20hair&image_size=square',
                    badges: [
                        { name: '前端开发基础', date: '2024.09.10', icon: 'code', unlocked: true },
                        { name: '后端框架应用', date: '2024.10.20', icon: 'server', unlocked: true },
                        { name: '数据库设计', date: '2024.11.15', icon: 'database', unlocked: true },
                        { name: '医疗软件规范', date: 'LOCKED', icon: 'lock', unlocked: false },
                        { name: '系统架构设计', date: 'LOCKED', icon: 'lock', unlocked: false },
                        { name: '年度优秀项目', date: 'LOCKED', icon: 'lock', unlocked: false }
                    ]
                },
                'admin': {
                    id: 'admin',
                    name: '管理员',
                    title: '系统管理员',
                    organization: '深圳大学医工融合卓越工程师协会',
                    major: '',
                    email: 'admin@szu.edu.cn',
                    phone: '',
                    wechat: '',
                    github: '',
                    quote: '系统管理员',
                    bio: '系统管理员账号',
                    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=cartoon%20avatar%20of%20an%20administrator&image_size=square',
                    badges: []
                }
            };
            
            // 插入默认用户
            for (const userId in defaultUsers) {
                const user = defaultUsers[userId];
                
                // 插入用户信息
                await query(
                    'INSERT INTO users (id, name, title, organization, major, email, phone, wechat, github, quote, bio, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [user.id, user.name, user.title, user.organization, user.major, user.email, user.phone, user.wechat, user.github, user.quote, user.bio, user.avatar]
                );
                
                // 插入密码哈希
                const passwordHash = bcrypt.hashSync('123456', 10);
                await query(
                    'INSERT INTO credentials (user_id, password_hash) VALUES (?, ?)',
                    [user.id, passwordHash]
                );
                
                // 插入图鉴
                for (const badge of user.badges) {
                    await query(
                        'INSERT INTO badges (user_id, name, date, icon, unlocked) VALUES (?, ?, ?, ?, ?)',
                        [user.id, badge.name, badge.date, badge.icon, badge.unlocked]
                    );
                }
            }
            
            console.log('默认数据初始化完成');
        }
    } catch (error) {
        console.error('初始化数据失败:', error);
    }
}

// 登录API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password || username.length > 100 || password.length > 256) {
        return res.status(400).json({ success: false, message: '请输入有效的用户名和密码' });
    }
    const attemptKey = req.ip;
    let attempt = attempts.get(attemptKey);
    if (!attempt || attempt.expires <= Date.now()) {
        attempt = { count: 0, expires: Date.now() + 15 * 60 * 1000 };
        attempts.set(attemptKey, attempt);
    }
    if (++attempt.count > 30) return res.status(429).json({ success: false, message: '尝试次数过多，请稍后再试' });
    
    try {
        // 从数据库获取用户密码哈希
        const credentials = await query('SELECT password_hash FROM credentials WHERE user_id = ?', [username]);
        if (credentials.length === 0) {
            return res.status(401).json({ success: false, message: '用户名或密码错误' });
        }
        
        const isValidPassword = await bcrypt.compare(password, credentials[0].password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ success: false, message: '用户名或密码错误' });
        }
        
        // 从数据库获取用户信息
        const users = await query('SELECT * FROM users WHERE id = ?', [username]);
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: '用户信息未找到' });
        }
        
        // 从数据库获取用户图鉴
        const badges = await query('SELECT name, date, icon, unlocked FROM badges WHERE user_id = ?', [username]);
        
        const user = profileFields.normalize(users[0]);
        user.badges = badges;
        user.growth = await growthService.profile(user.id, req.path === '/api/login' || (req.session && (req.session.userId === user.id || req.session.userId === 'admin')));
        
        // 生成简单的token
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, { userId: username, expires: Date.now() + SESSION_TTL });
        attempts.delete(attemptKey);
        
        res.json({
            success: true,
            token,
            user
        });
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({ success: false, message: '登录失败' });
    }
});

// 获取用户数据API
app.get('/api/users/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        // 从数据库获取用户信息
        const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        // 从数据库获取用户图鉴
        const badges = await query('SELECT name, date, icon, unlocked FROM badges WHERE user_id = ?', [userId]);
        
        const user = profileFields.normalize(users[0]);
        user.badges = badges;
        user.growth = await growthService.profile(user.id, req.path === '/api/login' || (req.session && (req.session.userId === user.id || req.session.userId === 'admin')));
        
        res.json({ success: true, user });
    } catch (error) {
        console.error('获取用户数据失败:', error);
        res.status(500).json({ success: false, message: '获取用户数据失败' });
    }
});

// 更新用户信息API
app.put('/api/users/:userId', async (req, res) => {
    const { userId } = req.params;
    const submittedData = req.body;
    
    try {
        // 检查用户是否存在
        const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        if(submittedData.gender!==undefined && !profileFields.genders.includes(submittedData.gender))return res.status(400).json({success:false,message:'请选择有效的性别选项'});
        const isAdmin=req.session.userId==='admin';
        const existingTitle=users[0].title || '成员';
        if(!isAdmin && Object.prototype.hasOwnProperty.call(submittedData,'title') && submittedData.title!==existingTitle){
            return res.status(403).json({success:false,message:'部门、职务和任职年份只能由管理员设置'});
        }
        if(isAdmin && submittedData.title!==undefined && (typeof submittedData.title!=='string' || submittedData.title.length>100))return res.status(400).json({success:false,message:'职位内容无效'});
        if(submittedData.wechat_qr!==undefined&&!require('./contact-service').qrValid(submittedData.wechat_qr))return res.status(400).json({success:false,message:'微信二维码图片格式或大小无效'});
        const updatedData={...users[0],...submittedData};
        updatedData.gender=profileFields.genders.includes(updatedData.gender)?updatedData.gender:'';
        const fields=['name','gender','student_id','organization','major','email','phone','wechat','wechat_qr','github','feishu_link','quote','bio','avatar'];
        if(isAdmin){fields.splice(2,0,'title');updatedData.title=(submittedData.title===undefined?existingTitle:submittedData.title.trim()) || '成员';}
        // Member writes omit title entirely, so concurrent administrator changes are preserved.
        await query('UPDATE users SET '+fields.map(field=>field+' = ?').join(', ')+' WHERE id = ?',
            [...fields.map(field=>updatedData[field] ?? ''),userId]);

        // 更新用户图鉴
        if (updatedData.badges && req.session.userId === 'admin') {
            // 先删除现有的图鉴
            await query('DELETE FROM badges WHERE user_id = ?', [userId]);
            
            // 插入新的图鉴
            for (const badge of updatedData.badges) {
                await query(
                    'INSERT INTO badges (user_id, name, date, icon, unlocked) VALUES (?, ?, ?, ?, ?)',
                    [userId, badge.name, badge.date, badge.icon, badge.unlocked]
                );
            }
        }
        
        // 获取更新后的用户信息
        const updatedUsers = await query('SELECT * FROM users WHERE id = ?', [userId]);
        const badges = await query('SELECT name, date, icon, unlocked FROM badges WHERE user_id = ?', [userId]);
        
        const user = profileFields.normalize(updatedUsers[0]);
        user.badges = badges;
        user.growth = await growthService.profile(user.id, req.path === '/api/login' || (req.session && (req.session.userId === user.id || req.session.userId === 'admin')));
        
        res.json({ success: true, user });
    } catch (error) {
        console.error('更新失败:', error);
        res.status(500).json({ success: false, message: '更新失败' });
    }
});

// 管理员API - 获取所有用户
app.get('/api/admin/users', async (req, res) => {
    try {
        // 从数据库获取所有用户
        const users = await query('SELECT * FROM users ORDER BY created_at ASC, id ASC');
        const usersMap = {};
        
        let memberNumber=0;
        // 为每个用户获取图鉴
        for (const user of users) {
            profileFields.normalize(user);
            user.member_number=user.id==='admin'?null:++memberNumber;
            const badges = await query('SELECT name, date, icon, unlocked FROM badges WHERE user_id = ?', [user.id]);
            user.badges = badges;
        user.growth = await growthService.profile(user.id, req.path === '/api/login' || (req.session && (req.session.userId === user.id || req.session.userId === 'admin')));
            usersMap[user.id] = user;
        }
        
        res.json({ success: true, users: usersMap, userOrder:users.map(user=>user.id) });
    } catch (error) {
        console.error('获取用户列表失败:', error);
        res.status(500).json({ success: false, message: '获取用户列表失败' });
    }
});

// 管理员API - 添加用户
app.post('/api/admin/users', async (req, res) => {
    const { userId, name, title, password, ...otherData } = req.body;
    if(otherData.gender!==undefined && !profileFields.genders.includes(otherData.gender))return res.status(400).json({success:false,message:'请选择有效的性别选项'});
    
    try {
        // 检查用户是否已存在
        const existingUsers = await query('SELECT * FROM users WHERE id = ?', [userId]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: '用户ID已存在' });
        }
        
        // 生成密码哈希
        const passwordHash = bcrypt.hashSync(password, 10);
        
        // 创建用户
        const encryptedId = encrypt(userId);
        await query(
            'INSERT INTO users (id, name, student_id, title, organization, major, email, phone, wechat, github, feishu_link, quote, bio, avatar, encrypted_id, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, name, otherData.student_id || '', title || '成员', otherData.organization || '深圳大学医工融合卓越工程师协会', otherData.major || '', otherData.email || '', otherData.phone || '', otherData.wechat || '', otherData.github || '', otherData.feishu_link || '', otherData.quote || '暂无个人格言', otherData.bio || '暂无个人简介', profileFields.avatar(otherData.avatar), encryptedId,otherData.gender || '']
        );

        // 插入密码哈希
        await query(
            'INSERT INTO credentials (user_id, password_hash) VALUES (?, ?)',
            [userId, passwordHash]
        );

        // 自动给新用户分配所有现有 badge（锁定状态）
        const allBadges = await query(
            'SELECT DISTINCT name, icon FROM badges WHERE name != ""'
        );
        for (const badge of allBadges) {
            await query(
                'INSERT INTO badges (user_id, name, date, icon, unlocked) VALUES (?, ?, ?, ?, ?)',
                [userId, badge.name, 'LOCKED', badge.icon, 0]
            );
        }
        
        // 获取新创建的用户信息
        const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
        const user = profileFields.normalize(users[0]);
        user.badges = [];
        
        res.json({ success: true, user });
    } catch (error) {
        console.error('添加用户失败:', error);
        res.status(500).json({ success: false, message: '添加失败' });
    }
});

// 管理员API - 删除用户
app.delete('/api/admin/users/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        if (userId === 'admin') {
            return res.status(400).json({ success: false, message: '无法删除管理员账户' });
        }
        
        // 检查用户是否存在
        const existingUsers = await query('SELECT * FROM users WHERE id = ?', [userId]);
        if (existingUsers.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        // 删除用户的图鉴
        await query('DELETE FROM badges WHERE user_id = ?', [userId]);
        
        // 删除用户的凭证
        await query('DELETE FROM credentials WHERE user_id = ?', [userId]);
        
        // 删除用户
        await query('DELETE FROM users WHERE id = ?', [userId]);
        
        res.json({ success: true, message: '用户删除成功' });
    } catch (error) {
        console.error('删除用户失败:', error);
        res.status(500).json({ success: false, message: '删除失败' });
    }
});

require('./member-service')(app, {pool, query, encrypt});
nfcService.register(app);
collaborationService.register(app);
require('./contact-service').register(app,{query,decrypt,resolveId:require('./account-migration').resolveId});

// 管理员API - 批量导入用户
app.post('/api/admin/import-users', async (req, res) => {
    const { users } = req.body;
    const importedUsers = [];
    const errors = [];
    
    for (const userData of users) {
        const userId = userData.id || `user${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            if(userData.gender!==undefined && !profileFields.genders.includes(userData.gender)){errors.push('性别选项无效：'+userId);continue;}
            // 检查用户是否已存在
            const existingUsers = await query('SELECT * FROM users WHERE id = ?', [userId]);
            if (existingUsers.length > 0) {
                errors.push(`用户ID ${userId} 已存在`);
                continue;
            }
            
            // 生成密码哈希
            const passwordHash = bcrypt.hashSync(userData.password || '123456', 10);
            
            // 创建用户
            const encryptedId = encrypt(userId);
            await query(
                'INSERT INTO users (id, name, student_id, title, organization, major, email, phone, wechat, github, feishu_link, quote, bio, avatar, encrypted_id, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    userId,
                    userData.name || '未命名',
                    userData.student_id || '',
                    userData.title || '成员',
                    userData.organization || '深圳大学医工融合卓越工程师协会',
                    userData.major || '',
                    userData.email || '',
                    userData.phone || '',
                    userData.wechat || '',
                    userData.github || '',
                    userData.feishu_link || '',
                    userData.quote || '暂无个人格言',
                    userData.bio || '暂无个人简介',
                    profileFields.avatar(userData.avatar),
                    encryptedId,
                    userData.gender || ''
                ]
            );
            
            // 添加登录凭证
            await query(
                'INSERT INTO credentials (user_id, password_hash) VALUES (?, ?)',
                [userId, passwordHash]
            );
            
            // 自动给新用户分配所有现有 badge（锁定状态）
            const allBadges = await query(
                'SELECT DISTINCT name, icon FROM badges WHERE name != ""'
            );
            for (const badge of allBadges) {
                await query(
                    'INSERT INTO badges (user_id, name, date, icon, unlocked) VALUES (?, ?, ?, ?, ?)',
                    [userId, badge.name, 'LOCKED', badge.icon, 0]
                );
            }
            
            importedUsers.push(userId);
        } catch (error) {
            console.error('导入用户失败:', error);
            errors.push(`导入用户 ${userId} 失败: ${error.message}`);
        }
    }
    
    res.json({ 
        success: true, 
        importedUsers, 
        errors,
        message: `成功导入 ${importedUsers.length} 个用户`
    });
});

// 用户页面路由（使用加密的用户ID）
app.get('/user/:encryptedUserId', async (req, res) => {
    const { encryptedUserId } = req.params;
    
    // 解密用户ID
    let userId = require('./account-migration').resolveId(decrypt(encryptedUserId));
    
    if (!userId) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>无效的链接</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .container {
                        text-align: center;
                        padding: 40px;
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 10px;
                        backdrop-filter: blur(10px);
                    }
                    h1 {
                        font-size: 48px;
                        margin-bottom: 20px;
                    }
                    p {
                        font-size: 18px;
                        margin-bottom: 30px;
                    }
                    a {
                        color: #ffd700;
                        text-decoration: none;
                        font-size: 18px;
                        border: 2px solid #ffd700;
                        padding: 10px 20px;
                        border-radius: 5px;
                        transition: all 0.3s ease;
                    }
                    a:hover {
                        background: #ffd700;
                        color: #667eea;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>404</h1>
                    <p>无效的链接</p>
                    <a href="/index.html">返回首页</a>
                </div>
            </body>
            </html>
        `);
    }
    
    try {
        // 从数据库获取用户信息
        const users = await query('SELECT * FROM users WHERE id = ? OR encrypted_id = ?', [userId,encryptedUserId]);
        if (users.length === 0) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>用户不存在</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                        }
                        .container {
                            text-align: center;
                            padding: 40px;
                            background: rgba(255, 255, 255, 0.1);
                            border-radius: 10px;
                            backdrop-filter: blur(10px);
                        }
                        h1 {
                            font-size: 48px;
                            margin-bottom: 20px;
                        }
                        p {
                            font-size: 18px;
                            margin-bottom: 30px;
                        }
                        a {
                            color: #ffd700;
                            text-decoration: none;
                            font-size: 18px;
                            border: 2px solid #ffd700;
                            padding: 10px 20px;
                            border-radius: 5px;
                            transition: all 0.3s ease;
                        }
                        a:hover {
                            background: #ffd700;
                            color: #667eea;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>404</h1>
                        <p>用户不存在</p>
                        <a href="/index.html">返回首页</a>
                    </div>
                </body>
                </html>
            `);
        }
        
        userId=users[0].id;
        // 从数据库获取用户图鉴
        const badges = await query('SELECT name, date, icon, unlocked FROM badges WHERE user_id = ?', [userId]);
        
        const user = profileFields.normalize(users[0]);
        user.badges = badges;
        user.growth = await growthService.profile(user.id, req.path === '/api/login' || (req.session && (req.session.userId === user.id || req.session.userId === 'admin')));
        
        // 返回用户页面，并注入用户数据
        const userPage = fs.readFileSync(path.join(__dirname, 'user.html'), 'utf8');
        const userData = JSON.stringify(user).replace(/</g, '\\u003c');
        const modifiedPage = userPage.replace('__USER_DATA__', userData);
        
        res.send(modifiedPage);
    } catch (error) {
        console.error('获取用户页面失败:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>服务器错误</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .container {
                        text-align: center;
                        padding: 40px;
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 10px;
                        backdrop-filter: blur(10px);
                    }
                    h1 {
                        font-size: 48px;
                        margin-bottom: 20px;
                    }
                    p {
                        font-size: 18px;
                        margin-bottom: 30px;
                    }
                    a {
                        color: #ffd700;
                        text-decoration: none;
                        font-size: 18px;
                        border: 2px solid #ffd700;
                        padding: 10px 20px;
                        border-radius: 5px;
                        transition: all 0.3s ease;
                    }
                    a:hover {
                        background: #ffd700;
                        color: #667eea;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>500</h1>
                    <p>服务器内部错误</p>
                    <a href="/index.html">返回首页</a>
                </div>
            </body>
            </html>
        `);
    }
});

// 获取全局 badge 模板列表（去重）
app.get('/api/admin/badges', async (req, res) => {
    try {
        const allBadges = await query("SELECT DISTINCT name, icon FROM badges WHERE name <> '' ORDER BY name");
        res.json({ success: true, badges: allBadges });
    } catch (error) {
        console.error('获取 badge 列表失败:', error);
        res.status(500).json({ success: false, message: '获取失败' });
    }
});

// 全局新增 badge（所有用户获得该 badge，锁定状态）
app.post('/api/admin/badges', async (req, res) => {
    let { name, icon } = req.body;
    
    try {
        if (typeof name !== 'string' || !name.trim() || name.length > 100 || (icon !== undefined && (typeof icon !== 'string' || !/^[a-z-]{1,40}$/.test(icon)))) {
            return res.status(400).json({ success: false, message: '请输入 badge 名称' });
        }
        
        name = name.trim();
        // 检查 badge 是否已存在
        const existingBadges = await query('SELECT DISTINCT name FROM badges WHERE name = ?', [name]);
        if (existingBadges.length > 0) {
            return res.status(400).json({ success: false, message: '该 badge 已存在' });
        }
        
        // 获取所有用户
        const allUsers = await query('SELECT id FROM users');
        
        // 给所有用户添加该 badge（锁定状态）
        for (const user of allUsers) {
            await query(
                'INSERT INTO badges (user_id, name, date, icon, unlocked) VALUES (?, ?, ?, ?, ?)',
                [user.id, name, 'LOCKED', icon || 'lock', 0]
            );
        }
        
        res.json({ success: true, message: `已为 ${allUsers.length} 个用户添加 badge "${name}"` });
    } catch (error) {
        console.error('添加 badge 失败:', error);
        res.status(500).json({ success: false, message: '添加失败' });
    }
});

// Preserve earned states and award dates when renaming or changing an award.
app.put('/api/admin/badges/:badgeName', async(req,res)=>{
 const original=req.params.badgeName;const {name,icon}=req.body;
 if(typeof name!=='string' || !name.trim() || name.length>100 || typeof icon!=='string' || !/^[a-z-]{1,40}$/.test(icon))return res.status(400).json({success:false,message:'名称或造型无效'});
 try {
  if(!(await query('SELECT DISTINCT name FROM badges WHERE name = ?',[original])).length)return res.status(404).json({success:false,message:'徽章不存在'});
  const next=name.trim();
  if(next!==original && (await query('SELECT DISTINCT name FROM badges WHERE name = ?',[next])).length)return res.status(409).json({success:false,message:'该名称已被其他徽章使用'});
  await query('UPDATE badges SET name = ?, icon = ? WHERE name = ?',[next,icon,original]);
  res.json({success:true,badge:{name:next,icon}});
 }catch {res.status(500).json({success:false,message:'修改失败，内容已保留'});}
});

// 全局删除 badge（从所有用户中移除）
app.delete('/api/admin/badges/:badgeName', async (req, res) => {
    const { badgeName } = req.params;
    
    try {
        // 从所有用户中删除该 badge
        await query('DELETE FROM badges WHERE name = ?', [badgeName]);
        res.json({ success: true, message: `已删除 badge "${badgeName}"` });
    } catch (error) {
        console.error('删除 badge 失败:', error);
        res.status(500).json({ success: false, message: '删除失败' });
    }
});

// 修改密码API
app.put('/api/change-password', async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;
    
    try {
        if (!username || !oldPassword || !newPassword) {
            return res.status(400).json({ success: false, message: '请填写完整信息' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: '新密码长度不能少于6位' });
        }
        
        // 获取当前密码哈希
        const credentials = await query('SELECT password_hash FROM credentials WHERE user_id = ?', [username]);
        if (credentials.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        // 验证旧密码
        const isValidOldPassword = bcrypt.compareSync(oldPassword, credentials[0].password_hash);
        if (!isValidOldPassword) {
            return res.status(401).json({ success: false, message: '旧密码错误' });
        }
        
        // 生成新密码哈希
        const newPasswordHash = bcrypt.hashSync(newPassword, 10);
        
        // 更新密码
        await query('UPDATE credentials SET password_hash = ? WHERE user_id = ?', [newPasswordHash, username]);
        
        res.json({ success: true, message: '密码修改成功' });
    } catch (error) {
        console.error('修改密码失败:', error);
        res.status(500).json({ success: false, message: '修改密码失败' });
    }
});

// 获取加密用户ID的API（固定不变）
app.get('/api/encrypt-user-id/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        // 从数据库检查用户是否存在
        const users = await query('SELECT id, encrypted_id FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        let encryptedUserId = users[0].encrypted_id;
        
        // 如果数据库中还没有（老用户），则生成并持久化存储
        if (!encryptedUserId) {
            encryptedUserId = encrypt(userId);
            await query('UPDATE users SET encrypted_id = ? WHERE id = ?', [encryptedUserId, userId]);
        }
        
        res.json({
            success: true,
            encryptedUserId,
            url: `/user/${encryptedUserId}`
        });
    } catch (error) {
        console.error('获取加密ID失败:', error);
        res.status(500).json({ success: false, message: '获取加密ID失败' });
    }
});

// ==================== 飞书 OAuth 骨架 ====================
// 使用前请在下方填写你的飞书应用 App ID 和 App Secret
// 获取方式：飞书开放平台 → 开发者后台 → 你的应用 → 凭证与基础信息
const FEISHU_CONFIG = {
    appId: (process.env.FEISHU_APP_ID || '').trim(),       // 飞书应用 App ID
    appSecret: (process.env.FEISHU_APP_SECRET || '').trim(),   // 飞书应用 App Secret
    redirectUri: process.env.FEISHU_REDIRECT_URI || 'https://szumiee.tech/api/feishu/callback', // 飞书后台配置的重定向 URL
};

// HTTPS 请求辅助函数（兼容所有 Node.js 版本）
const https = require('https');

function httpsPost(url, body, extraHeaders) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(body);
        const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: Object.assign({
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }, extraHeaders || {})
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[Feishu API] POST ${urlObj.pathname} → HTTP ${res.statusCode}, body: ${data}`);
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode !== 200) {
                        return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                    resolve(json);
                } catch (e) {
                    reject(new Error('JSON parse error: ' + data));
                }
            });
        });
        req.on('error', (err) => {
            console.error('[Feishu API] POST 请求失败:', err.message);
            reject(err);
        });
        req.write(postData);
        req.end();
    });
}

function httpsGet(url, headers) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'GET',
            headers: headers || {}
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[Feishu API] GET ${urlObj.pathname} → HTTP ${res.statusCode}, body: ${data}`);
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode !== 200) {
                        return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                    resolve(json);
                } catch (e) {
                    reject(new Error('JSON parse error: ' + data));
                }
            });
        });
        req.on('error', (err) => {
            console.error('[Feishu API] GET 请求失败:', err.message);
            reject(err);
        });
        req.end();
    });
}

// 飞书 OAuth：生成授权链接
app.get('/api/feishu/login', requireSession, (req, res) => {
    if (!FEISHU_CONFIG.appId || !FEISHU_CONFIG.appSecret) {
        return res.status(503).json({ success: false, message: '飞书应用未配置，请联系管理员' });
    }
    const state = crypto.randomBytes(32).toString('hex');
    oauthStates.set(state, { userId: req.session.userId, expires: Date.now() + 10 * 60 * 1000 });
    const authUrl = 'https://open.feishu.cn/open-apis/authen/v1/authorize'
        + '?app_id=' + FEISHU_CONFIG.appId
        + '&redirect_uri=' + encodeURIComponent(FEISHU_CONFIG.redirectUri)
        + '&state=' + encodeURIComponent(state);
    res.json({ success: true, url: authUrl });
});

// 飞书 OAuth：回调处理
app.get('/api/feishu/callback', async (req, res) => {
    const { code, state } = req.query;
    const binding = oauthStates.get(state);
    oauthStates.delete(state);
    if (!binding || binding.expires <= Date.now()) return res.status(400).send('授权已过期，请重新绑定');
    if (!code) {
        return res.status(400).send('缺少授权码');
    }

    try {
        // 1. 先获取 app_access_token（应用级令牌，飞书新版 API 必须）
        console.log('[Feishu OAuth] 正在获取 app_access_token...');
        const appTokenData = await httpsPost('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
            app_id: FEISHU_CONFIG.appId,
            app_secret: FEISHU_CONFIG.appSecret
        });
        if (appTokenData.code !== 0) {
            console.error('[Feishu OAuth] 获取 app_access_token 失败:', JSON.stringify(appTokenData));
            return res.status(400).send(
                '飞书应用令牌获取失败 (code=' + appTokenData.code + '): ' + (appTokenData.msg || JSON.stringify(appTokenData))
            );
        }
        const appAccessToken = appTokenData.app_access_token;
        console.log('[Feishu OAuth] app_access_token 获取成功, 长度:', appAccessToken ? appAccessToken.length : '空!');
        if (!appAccessToken) {
            console.error('[Feishu OAuth] app_access_token 为空! 完整响应:', JSON.stringify(appTokenData));
            return res.status(400).send('获取飞书应用令牌失败: 响应中没有 app_access_token');
        }

        // 2. 用 code + app_access_token 换取 user_access_token
        const tokenData = await httpsPost('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: FEISHU_CONFIG.redirectUri
        }, {
            'Authorization': 'Bearer ' + appAccessToken,
            'Content-Type': 'application/json'
        });
        if (tokenData.code !== 0) {
            console.error('[Feishu OAuth] 获取 user_access_token 失败:', JSON.stringify(tokenData));
            return res.status(400).send(
                '飞书授权失败 (code=' + tokenData.code + '): ' + (tokenData.msg || JSON.stringify(tokenData))
            );
        }
        const userAccessToken = tokenData.data.access_token;

        // 3. 用 user_access_token 获取用户信息
        const profileData = await httpsGet('https://open.feishu.cn/open-apis/authen/v1/user_info', {
            'Authorization': 'Bearer ' + userAccessToken
        });
        if (profileData.code !== 0) {
            console.error('[Feishu OAuth] 获取用户信息失败:', JSON.stringify(profileData));
            return res.status(400).send('获取飞书用户信息失败 (code=' + profileData.code + ')');
        }
        const feishuOpenId = profileData.data.open_id;
        const feishuName = (profileData.data.name || '飞书用户');
        const feishuAvatar = profileData.data.avatar_url || profileData.data.avatar_thumb || '';
        console.log('[Feishu OAuth] 用户信息获取成功, open_id:', feishuOpenId, ', name:', feishuName, ', avatar:', feishuAvatar);

        // 4. 将 feishu_open_id 绑定到系统用户
        const userId = binding.userId;
        if (userId) {
            const feishuProfileUrl = 'https://dcnjoonwslf3.feishu.cn/people/' + feishuOpenId;
            await query(
                'UPDATE users SET feishu_open_id = ?, feishu_link = ?, feishu_avatar = ? WHERE id = ?',
                [feishuOpenId, feishuProfileUrl, feishuAvatar, userId]
            );
            console.log('[Feishu OAuth] 已绑定用户 ' + userId + ' 到飞书用户 ' + feishuName + ', 主页: ' + feishuProfileUrl);
        } else {
            console.warn('[Feishu OAuth] state 为空，无法绑定用户');
        }

        // 5. 跳回前端页面（不传 name 参数，由前端从接口获取）
        res.redirect('/index.html?feishu_bound=1');
    } catch (error) {
        console.error('[Feishu OAuth] 回调处理异常:', error.message);
        res.status(500).send('飞书授权处理失败: ' + error.message);
    }
});

// 获取用户飞书绑定状态
app.get('/api/feishu/status/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await query('SELECT feishu_link, feishu_open_id, feishu_avatar FROM users WHERE id = ?', [userId]);
        if (result.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        res.json({
            success: true,
            bound: !!(result[0].feishu_open_id),
            feishu_link: result[0].feishu_link || '',
            feishu_open_id: result[0].feishu_open_id || '',
            feishu_avatar: result[0].feishu_avatar || ''
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '获取飞书状态失败' });
    }
});

// 解绑飞书
app.post('/api/feishu/unbind/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        await query('UPDATE users SET feishu_open_id = \'\', feishu_link = \'\' WHERE id = ?', [userId]);
        res.json({ success: true, message: '已解绑飞书' });
    } catch (error) {
        res.status(500).json({ success: false, message: '解绑失败' });
    }
});
// ==================== 飞书 OAuth 骨架结束 ====================

// API failures are JSON, including malformed input and missing deployed routes.
app.use('/api', (req, res) => res.status(404).json({ success: false, message: '接口不存在，请检查后端版本和 API 路由配置' }));
app.use((error, req, res, next) => {
    if (!req.path.startsWith('/api/')) return next(error);
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
    res.status(status).json({ success: false, message: status === 413 ? '提交内容过大，请缩短材料后重试' : status === 400 ? '请求格式无效，请刷新页面后重试' : '服务暂时不可用，请稍后重试' });
});

// 启动服务器
(async () => {
    await initializeData();
    app.listen(PORT, () => {
        console.log(`服务器运行在 http://localhost:${PORT}`);
        console.log(`前端访问地址: http://localhost:${PORT}/index.html`);
        
        // 生成示例加密用户ID
        const exampleEncryptedId = encrypt('user1');
        console.log(`用户页面示例: http://localhost:${PORT}/user/${exampleEncryptedId}`);
    });
})();
