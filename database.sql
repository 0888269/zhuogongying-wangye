-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS nfc_web;

USE nfc_web;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    title VARCHAR(100),
    organization VARCHAR(255),
    major VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    wechat VARCHAR(100),
    github VARCHAR(100),
    quote TEXT,
    bio TEXT,
    avatar VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 凭证表（存储密码哈希）
CREATE TABLE IF NOT EXISTS credentials (
    user_id VARCHAR(50) PRIMARY KEY,
    password_hash VARCHAR(255) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 图鉴表
CREATE TABLE IF NOT EXISTS badges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    date VARCHAR(20),
    icon VARCHAR(50),
    unlocked BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 访客记录表
CREATE TABLE IF NOT EXISTS visitor_records (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    date VARCHAR(20) NOT NULL,
    time VARCHAR(20) NOT NULL,
    method VARCHAR(50) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- 成长任务：成员提交，管理员审核
CREATE TABLE IF NOT EXISTS growth_submissions (
    user_id VARCHAR(50) NOT NULL,
    task_id VARCHAR(100) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    evidence TEXT NOT NULL,
    review_note TEXT,
    reviewed_by VARCHAR(50),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    PRIMARY KEY (user_id, task_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Badge presentation overrides preserve stable task IDs and approvals.
CREATE TABLE IF NOT EXISTS growth_badge_definitions (
 task_id VARCHAR(100) PRIMARY KEY, name VARCHAR(100) NOT NULL,
 requirement TEXT NOT NULL, icon VARCHAR(40) NOT NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
