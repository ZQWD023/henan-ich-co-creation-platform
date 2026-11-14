// scripts/demo-social.js —— 给演示库补一点真实互动数据（报名 / 收藏 / 点赞 / 评论）
// 用法：npm run demo:social
const { initDatabase, db } = require('../db/database');
const { userRepo } = require('../repositories/user.repo');
const { genId } = require('../utils/id');

function ensure(id, username, email, role, name, cert, hash) {
  const exist = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!exist) {
    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, display_name, role, cert_status, joined_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, username, email, hash, name, role, cert, new Date().toISOString());
  }
  return userRepo.findById(id);
}

function run() {
  initDatabase();
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('123456', 10);

  const users = [
    ensure('user_demo_user', 'user', 'user@ich.local', 'user', '小林同学', 'none', hash),
    ensure('user_demo_designer', 'designer', 'designer@ich.local', 'creator', '林一设计', 'approved', hash),
    ensure('user_demo_writer', 'writer', 'writer@ich.local', 'creator', '陈默文案', 'approved', hash),
    ensure('user_demo_curator', 'curator', 'curator@ich.local', 'creator', '非遗馆·周老师', 'approved', hash),
  ];

  /* ---------- 1. 活动报名 ---------- */
  const events = db.prepare('SELECT id FROM event ORDER BY event_date DESC LIMIT 4').all();
  let signups = 0;
  users.forEach((u, i) => {
    events.slice(0, Math.min(events.length, 2 + (i % 3))).forEach((e) => {
      const exist = db.prepare('SELECT id FROM enrollment WHERE user_id = ? AND event_id = ?').get(u.id, e.id);
      if (exist) return;
      db.prepare(
        `INSERT INTO enrollment (id, user_id, event_id, real_name, phone, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`
      ).run(genId('enr'), u.id, e.id, u.display_name || u.username, '1380013' + String(8000 + i).padStart(4, '0'), null);
      signups++;
    });
  });

  /* ---------- 2. 收藏非遗项目 ---------- */
  const heritages = db.prepare("SELECT id FROM heritage WHERE status='published' ORDER BY popularity DESC LIMIT 12").all();
  let favs = 0;
  users.forEach((u, i) => {
    heritages.slice(i * 2, i * 2 + 5).forEach((h) => {
      const r = db
        .prepare(
          `INSERT OR IGNORE INTO interaction (id, user_id, target_type, target_id, action)
           VALUES (?, ?, 'heritage', ?, 'favorite')`
        )
        .run(genId('int'), u.id, h.id);
      favs += r.changes;
    });
  });

  /* ---------- 3. 点赞 + 收藏作品 ---------- */
  const works = db.prepare("SELECT id, likes_count, favorites_count FROM work WHERE status='approved' ORDER BY created_at DESC LIMIT 12").all();
  let likes = 0, workFavs = 0;
  works.forEach((w, wi) => {
    users.slice(0, 1 + (wi % 4)).forEach((u) => {
      const r1 = db
        .prepare(
          `INSERT OR IGNORE INTO interaction (id, user_id, target_type, target_id, action)
           VALUES (?, ?, 'work', ?, 'like')`
        )
        .run(genId('int'), u.id, w.id);
      if (r1.changes) {
        likes++;
        db.prepare('UPDATE work SET likes_count = likes_count + 1 WHERE id = ?').run(w.id);
      }
      if (wi % 3 === 0) {
        const r2 = db
          .prepare(
            `INSERT OR IGNORE INTO interaction (id, user_id, target_type, target_id, action)
             VALUES (?, ?, 'work', ?, 'favorite')`
          )
          .run(genId('int'), u.id, w.id);
        if (r2.changes) {
          workFavs++;
          db.prepare('UPDATE work SET favorites_count = favorites_count + 1 WHERE id = ?').run(w.id);
        }
      }
    });
  });

  /* ---------- 4. 关注 ---------- */
  let follows = 0;
  const owners = db.prepare("SELECT id FROM users WHERE role IN ('creator','admin') LIMIT 4").all();
  users.forEach((u, i) => {
    owners.slice(0, 1 + (i % 3)).forEach((o) => {
      if (o.id === u.id) return;
      const r = db
        .prepare(
          `INSERT OR IGNORE INTO interaction (id, user_id, target_type, target_id, action)
           VALUES (?, ?, 'user', ?, 'follow')`
        )
        .run(genId('int'), u.id, o.id);
      follows += r.changes;
    });
  });

  /* ---------- 5. 作品评论 ---------- */
  const comments = [
    '釉色的那一抹流动感抓得很准，一眼能看出是钧瓷。',
    '这个包装如果做成可回收材质就更完整了。',
    '纹样的疏密关系处理得舒服，建议再做一版单色的。',
  ];
  let cmt = 0;
  works.slice(0, 3).forEach((w, i) => {
    const u = users[i % users.length];
    const exist = db.prepare('SELECT id FROM comment WHERE target_id = ? AND user_id = ?').get(w.id, u.id);
    if (exist) return;
    db.prepare(
      `INSERT INTO comment (id, user_id, target_type, target_id, content, status)
       VALUES (?, ?, 'work', ?, ?, 'visible')`
    ).run(genId('cmt'), u.id, w.id, comments[i % comments.length]);
    db.prepare('UPDATE work SET comments_count = comments_count + 1 WHERE id = ?').run(w.id);
    cmt++;
  });

  /* ---------- 6. 留一条待审作品 + 待审认证，供后台演示 ---------- */
  const demoUser = users[0];
  if (!db.prepare("SELECT id FROM work WHERE title = ?").get('（演示）戏曲脸谱杯垫设计')) {
    db.prepare(`INSERT INTO work (id, user_id, heritage_id, title, work_type, summary, tags, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`)
      .run(genId('work'), demoUser.id, 'yuju', '（演示）戏曲脸谱杯垫设计', '产品设计',
        '用豫剧脸谱做一套硅胶杯垫，保留勾脸的程式化用色，等待管理员审核。', JSON.stringify(['脸谱', '杯垫']));
    console.log('  待审作品    +1');
  }
  if (!db.prepare("SELECT id FROM user_certification WHERE user_id = ? AND status = 'pending'").get(demoUser.id)) {
    db.prepare(`INSERT INTO user_certification (id, user_id, real_name, heritage_id, level, title, intro, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`)
      .run(genId('cert'), demoUser.id, '林小满', 'junci', '市级', '钧瓷烧制技艺市级传承人', '从事钧瓷烧制 15 年，主攻釉色复原与器型创新。');
    db.prepare("UPDATE users SET cert_status='pending' WHERE id = ?").run(demoUser.id);
    console.log('  待审认证    +1');
  }

  console.log('\n=== 演示互动数据完成 ===');
  console.log(`  活动报名    +${signups}`);
  console.log(`  收藏非遗    +${favs}`);
  console.log(`  点赞作品    +${likes}`);
  console.log(`  收藏作品    +${workFavs}`);
  console.log(`  关注创作者  +${follows}`);
  console.log(`  作品评论    +${cmt}`);
  console.log('');
}

if (require.main === module) {
  try { run(); } catch (e) { console.error('失败：', e.message); process.exit(1); }
}
module.exports = { run };
