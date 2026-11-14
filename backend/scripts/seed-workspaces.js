// scripts/seed-workspaces.js —— 给已有账号补"有内容的工作台"
//
//   node scripts/seed-workspaces.js              # 给所有还没有自有项目的账号补
//   node scripts/seed-workspaces.js 123 456      # 只补指定用户名
//   node scripts/seed-workspaces.js --all        # 包括演示账号（一般不需要）
const { db } = require('../db/database');
const { seedUserWorkspace, ensureAssignedTasks } = require('../services/onboarding.service');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ALL = args.length > 0;

let users;
if (ALL) {
  users = db.prepare('SELECT id, username FROM users WHERE id IN (' + args.map(() => '?').join(',') + ')').all(...args);
} else {
  // 默认：所有账号（已经有自有项目的会被服务内部跳过）
  users = db.prepare('SELECT id, username FROM users ORDER BY created_at').all();
}

console.log(`检查 ${users.length} 个账号 ...\n`);
let seeded = 0;
let skipped = 0;
for (const u of users) {
  const r = seedUserWorkspace(u.id);
  if (!r.ok) {
    console.log(`✗ ${u.username}: ${r.reason}`);
    continue;
  }
  if (r.skipped) {
    // 已���项目：补一次"参与项目的指派任务"，避免待办是 0
    const extra = ensureAssignedTasks(u.id);
    skipped++;
    if (extra) console.log(`· ${u.username.padEnd(12)} 补了 ${extra} 个参与任务`);
    continue;
  }
  seeded++;
  console.log(`✓ ${u.username.padEnd(12)} 新建项目「${r.project}」，参与 ${r.joined} 个，待审申请 ${r.pending} 条`);
}

console.log(`\n完成：补了 ${seeded} 个账号，跳过 ${skipped} 个（已有项目）`);

// 汇报每个账号的工作台摘要
console.log('\n各账号工作台：');
for (const u of users.slice(0, 12)) {
  const owned = db.prepare('SELECT COUNT(*) n FROM co_project WHERE owner_id = ?').get(u.id).n;
  const joined = db
    .prepare(
      "SELECT COUNT(*) n FROM co_member m JOIN co_project p ON p.id=m.project_id WHERE m.user_id=? AND m.status='approved' AND p.owner_id!=?"
    )
    .get(u.id, u.id).n;
  const pending = db
    .prepare("SELECT COUNT(*) n FROM co_member m JOIN co_project p ON p.id=m.project_id WHERE p.owner_id=? AND m.status='pending'")
    .get(u.id).n;
  const todo = db
    .prepare("SELECT COUNT(*) n FROM co_task WHERE assignee_id=? AND status IN ('todo','doing','review')")
    .get(u.id).n;
  console.log(`  ${u.username.padEnd(12)} 发起 ${owned} / 参与 ${joined} / 待审 ${pending} / 待办 ${todo}`);
}
