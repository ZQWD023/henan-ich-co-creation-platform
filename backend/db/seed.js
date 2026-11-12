// db/seed.js —— 把 seed-data.json 灌进数据库
// 用法：npm run seed
// 幂等：已存在的记录跳过（INSERT OR IGNORE），改数据后重跑不会炸
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { db, initDatabase } = require('./database');

const seedPath = path.join(__dirname, 'seed-data.json');

function j(v) {
  if (v === undefined || v === null) return null;
  return typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v);
}

function seedCategories(data) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO category (id, name, icon, color, description, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  data.ichCategories.forEach((c, i) => {
    stmt.run(c.id, c.name, c.icon ?? null, c.color ?? null, c.description ?? null, i);
  });
  return data.ichCategories.length;
}

function seedHeritage(data) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO heritage
     (id, name, category_id, level, region, year, icon, gradient, brief, intro, history, lineage,
      features, steps, visit, tags, popularity, likes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let n = 0;
  for (const p of data.heritageProjects) {
    stmt.run(
      p.id,
      p.name,
      p.category,
      p.level ?? null,
      p.region ?? null,
      p.year ?? null,
      p.icon ?? null,
      p.gradient ?? null,
      p.brief ?? null,
      p.intro ?? null,
      p.history ?? null,
      p.lineage ?? null,
      j(p.features || []),
      j(p.steps || []),
      p.visit ?? null,
      j(p.tags || []),
      p.popularity ?? 0,
      p.likes ?? 0
    );
    n++;
  }
  return n;
}

function seedInheritors(data) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO inheritor
     (id, name, gender, level, heritage_id, title, region, years, bio, icon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let n = 0;
  for (const i of data.inheritors) {
    stmt.run(
      i.id,
      i.name,
      i.gender ?? null,
      i.level ?? null,
      i.projectId ?? null,
      i.title ?? null,
      i.region ?? null,
      i.years ?? null,
      i.bio ?? null,
      i.icon ?? null
    );
    n++;
  }
  return n;
}

function seedWorks(data) {
  // 共创作品需要作者账号，先建一个"平台官方"账号承接历史作品
  const officialId = 'user_official_platform';
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(officialId);
  if (!exists) {
    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, display_name, role, cert_status, joined_date)
       VALUES (?, ?, ?, ?, ?, 'creator', 'approved', ?)`
    ).run(
      officialId,
      'platform_official',
      'official@ich.local',
      bcrypt.hashSync(Math.random().toString(36), 10),
      '平台官方',
      new Date().toISOString()
    );
  }

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO work
     (id, user_id, heritage_id, title, work_type, summary, content, cover_url, tags,
      status, views_count, likes_count, favorites_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)`
  );
  let n = 0;
  for (const w of data.coCreateWorks) {
    stmt.run(
      w.id,
      officialId,
      w.projectId ?? null,
      w.title,
      w.category ?? null,
      w.desc ?? null,
      w.desc ?? null,
      null,
      j(w.tags || []),
      Math.round((w.votes || 0) * 3 + 500),
      w.likes ?? 0,
      Math.round((w.votes || 0) / 2),
      w.date ? new Date(w.date).toISOString() : new Date().toISOString()
    );
    n++;
  }
  return n;
}

function seedEvents(data) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO event (id, title, type, event_date, location, status, description, icon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  (data.events || []).forEach((e) =>
    stmt.run(e.id, e.title, e.type ?? null, e.date ?? null, e.location ?? null, e.status ?? null, e.desc ?? null, e.icon ?? null)
  );
  return (data.events || []).length;
}

function seedNews(data) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO news (id, title, news_date, source, category, summary)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  (data.news || []).forEach((n) =>
    stmt.run(n.id, n.title, n.date ?? null, n.source ?? null, n.category ?? null, n.summary ?? null)
  );
  return (data.news || []).length;
}

function seedAchievements(data) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO achievement (key_, title, description, icon, color) VALUES (?, ?, ?, ?, ?)`
  );
  (data.ichAchievements || []).forEach((a) =>
    stmt.run(a.id, a.title, a.desc ?? null, a.icon ?? null, a.color ?? null)
  );
  return (data.ichAchievements || []).length;
}

function seedDemoAccounts() {
  // 演示账号：admin / creator / user，密码统一 123456（仅演示环境，生产请删）
  const accounts = [
    ['user_demo_admin', 'admin', 'admin@ich.local', 'admin', '管理员', 'approved'],
    ['user_demo_creator', 'creator', 'creator@ich.local', 'creator', '豫剧传承人·张老师', 'approved'],
    ['user_demo_user', 'user', 'user@ich.local', 'user', '设计系学生·小林', 'none'],
  ];
  const hash = bcrypt.hashSync('123456', 10);
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role, cert_status, joined_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  accounts.forEach(([id, username, email, role, name, cert]) =>
    stmt.run(id, username, email, hash, name, role, cert, new Date().toISOString())
  );
  return accounts.map((a) => a[1]).join(', ');
}

function seed() {
  initDatabase();
  if (!fs.existsSync(seedPath)) {
    throw new Error(`缺少 ${seedPath}，请先执行 npm run import-data`);
  }
  const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const stats = db.transaction(() => ({
    categories: seedCategories(data),
    heritage: seedHeritage(data),
    inheritors: seedInheritors(data),
    works: seedWorks(data),
    events: seedEvents(data),
    news: seedNews(data),
    achievements: seedAchievements(data),
  }))();

  const demo = seedDemoAccounts();

  console.log('=== 数据初始化完成 ===');
  Object.entries(stats).forEach(([k, v]) => console.log(`  ${k.padEnd(12)} ${v}`));
  console.log(`  演示账号       ${demo}（密码均为 123456）`);
  console.log(`  数据库文件     ${config.dbPath}`);
}

if (require.main === module) {
  try {
    seed();
  } catch (err) {
    console.error('初始化失败：', err.message);
    process.exit(1);
  }
}

module.exports = { seed };
