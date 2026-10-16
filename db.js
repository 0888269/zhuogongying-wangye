const mysql = require('mysql2/promise');

// 数据库连接配置
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),  // 替换为你的腾讯云数据库主机
    user: process.env.DB_USER || 'admin',     // 替换为你的数据库用户名
    password: process.env.DB_PASSWORD || '', // 替换为你的数据库密码
    database: process.env.DB_NAME || 'nfc_web',          // 数据库名
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// 创建数据库连接池
const pool = mysql.createPool(dbConfig);

// 测试数据库连接
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('数据库连接成功');
        connection.release();
        return true;
    } catch (error) {
        console.error('数据库连接失败:', error);
        return false;
    }
}

// 执行SQL查询
async function query(sql, params = []) {
    try {
        const [results] = await pool.execute(sql, params);
        return results;
    } catch (error) {
        console.error('SQL查询失败:', error);
        throw error;
    }
}

// 关闭数据库连接池
async function closePool() {
    try {
        await pool.end();
        console.log('数据库连接池已关闭');
    } catch (error) {
        console.error('关闭数据库连接池失败:', error);
    }
}

module.exports = {
    pool,
    testConnection,
    query,
    closePool
};