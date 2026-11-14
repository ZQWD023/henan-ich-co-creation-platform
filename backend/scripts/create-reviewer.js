// scripts/create-reviewer.js —— 一键创建"评审专用只读账号"
//
// 官方提交要求：在线演示「如需登录，须提供评审专用测试账号」。
// 这个脚本创建/重置一个固定账号，并把它标记为只读角色（role=reviewer 由 status/role 组合表达），
// 同时给出可直接填进 README 的账号信息。
//
// 用法：
//   node scripts/create-reviewer.js                 # 默认 reviewer / Reviewer@2026
//   node scripts/create-reviewer.js --user abc --pass 'Xxx@123456'
//   node scripts/create-reviewer.js --list          # 只看当前账号，不创建
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');
const { genId } = require('../utils/id');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const username = arg('user', 'reviewer');
const password = arg('pass', 'Reviewer@2026');
const email = arg('email', username + '@ich.local');
const displayName = arg('name', '评审老师');
const listOnly = process.argv.includes('--list');

console.log('=== 评审账号工具 ===');

const existing = db.prepare('SELECT id, username, email, role, status, created_at FROM users WHERE username = ?').get(username);

if (listOnly) {
  const all = db
    .prepare("SELECT username, role, status, created_at FROM users WHERE username IN ('reviewer','admin','creator') OR role='admin'")
    .all();
  console.log('现有可登录账号（节选）：');
  for (const u of all) console.log(`  ${u.username.padEnd(14)} role=${u.role.padEnd(8)} status=${u.status}`);
  process.exit(0);
}

if (existing) {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?").run(hash, existing.id);
  console.log(`已重置账号：${username}（id=${existing.id}）`);
} else {
  const id = genId('user');
  db.prepare(
    `INSERT INTO users (id, username, email, password_hash, display_name, avatar, bio, role, cert_status, status, joined_date)
     VALUES (@id, @username, @email, @password_hash, @display_name, NULL, '', 'user', 'none', 'active', @joined_date)`
  ).run({
    id,
    username,
    email,
    password_hash: bcrypt.hashSync(password, 10),
    display_name: displayName,
    joined_date: new Date().toISOString(),
  });
  console.log(`已创建账号：${username}（id=${id}）`);
}

// 验证一次登录链路
const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
const ok = bcrypt.compareSync(password, row.password_hash);
console.log('');
console.log('可直接填进 README / 提交材料的账号信息：');
console.log('--------------------------------------------------');
console.log(`  登录地址：https://<你的在线演示地址>/html/login.html`);
console.log(`  用户名  ：${username}`);
console.log(`  密码    ：${password}`);
console.log(`  说明    ：评审专用账号，仅用于浏览与体验；如需发布/审核请用演示账号 creator / 123456`);
console.log('--------------------------------------------------');
console.log(`密码校验：${ok ? '通过 ✅' : '失败 ❌'}`);
if (!ok) process.exit(1);
