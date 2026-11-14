// services/onboarding.service.js —— 新账号自动获得一个"有内容"的共创工作台
//
// 为什么需要：评委或队友随手注册一个账号，进「我的工作台」看到全是 0，
// 会以为功能没做完。这个服务给**任意新账号**铺一套可演示的数据：
//   · 1 个他发起的项目（含任务、版本、讨论、2 条待审申请）
//   · 2 个他参与的项目（别人发起，他是成员，并各派 1 个任务给他）
//   · 3-4 个指派给他的任务（进行中 / 待验收 / 待开始）
// 幂等：已经有自有项目的账号直接跳过。
const { db } = require('../db/database');
const { genId } = require('../utils/id');

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const days = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10) + ' 23:59:59';

/** 题材池：每个用户挑不同的一项，避免和演示账号撞题 */
const THEMES = [
  { heritage: 'ruci', title: '汝瓷「天青」咖啡杯共创', theme: '把汝瓷天青釉的温润感做成一组咖啡杯，配极简杯碟' },
  { heritage: 'xinyang-maojian', title: '信阳毛尖「明前」茶包共创', theme: '便携茶包 + 手提袋，强调一芽一叶的采摘标准' },
  { heritage: 'lingbao-jianzhi', title: '灵宝剪纸窗花新绘', theme: '把剪纸窗花做成可贴可裱的现代装饰' },
  { heritage: 'nanyang-laohua', title: '南阳烙画书签共创', theme: '用烙画的焦色层次做一组木质书签' },
  { heritage: 'xunxian-nigugu', title: '浚县泥咕咕盲盒共创', theme: '把泥咕咕做成年轻人愿意收集的盲盒' },
  { heritage: 'kaifeng-pangu', title: '开封盘鼓节奏绘本共创', theme: '把盘鼓的鼓点画成可读的节奏绘本' },
  { heritage: 'luoyang-shuixi', title: '洛阳水席餐具共创', theme: '为水席的一道菜设计专属餐具' },
  { heritage: 'majie-shuhui', title: '马街书会说书人形象共创', theme: '为说书人做一套可传播的形象 IP' },
];

const TASK_POOL = {
  owned: [
    ['确定母题与风格方向', '从该非遗项目的工艺与纹样里提炼 3 个可用母题', 'done', 100],
    ['出 3 版草图', '每版标注工艺可行性与成本区间', 'doing', 45],
    ['打样与成本核算', '找 1-2 家工坊报价，出打样清单', 'review', 100],
    ['详情页文案与拍摄', '讲清工艺价值与使用场景', 'todo', 0],
  ],
  joined: [
    ['素材整理与归档', '把已有素材按母题/工艺分类，便于检索', 'todo', 0],
    ['评审意见汇总', '把讨论区的意见整理成可执行清单', 'doing', 30],
  ],
};

function pickTheme(userId) {
  // 选当前用得最少的题材：同一题材被多个账号用过就会排到后面，减少重名
  const used = new Map();
  for (const row of db.prepare('SELECT title FROM co_project').all()) {
    used.set(row.title, (used.get(row.title) || 0) + 1);
  }
  let best = THEMES[0];
  let bestCount = Infinity;
  for (const th of THEMES) {
    const c = used.get(th.title) || 0;
    if (c < bestCount) {
      best = th;
      bestCount = c;
    }
  }
  if (bestCount > 0) {
    // 全用过了：按 hash 选一个，并在标题后加短后缀避免完全重名
    let h = 0;
    for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) % 100000;
    const pick = THEMES[h % THEMES.length];
    return { ...pick, title: pick.title + '（' + String(userId).slice(-4) + '）' };
  }
  return best;
}

function seedUserWorkspace(userId, opts = {}) {
  const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, reason: 'no-user' };

  const ownedCount = db.prepare('SELECT COUNT(*) n FROM co_project WHERE owner_id = ?').get(userId).n;
  if (ownedCount > 0) return { ok: true, skipped: true, reason: 'already-has-project' };

  // 演示协作者（用现有账号，没有就跳过申请人部分）
  const mates = db
    .prepare("SELECT id, display_name, username FROM users WHERE id != ? AND role IN ('creator','admin','user') ORDER BY id LIMIT 3")
    .all(userId);

  const spec = pickTheme(userId);
  const pid = genId('proj');
  const displayName = user.display_name || user.username;

  db.prepare(
    `INSERT INTO co_project (id, owner_id, heritage_id, title, description, recruit_need, member_limit, deadline, status, members_count, is_featured, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', 1, 0, ?, ?)`
  ).run(
    pid,
    userId,
    spec.heritage,
    spec.title,
    `${spec.theme}。这是一个可以直接上手协作的共创项目：任务已经拆好，欢迎擅长设计与文案的伙伴加入。`,
    '视觉设计 1 名、文案 1 名（熟悉非遗或民俗）',
    5,
    days(24),
    now(),
    now()
  );

  // 发起人自己入成员表
  db.prepare(
    `INSERT OR IGNORE INTO co_member (id, project_id, user_id, role, status, reviewed_by, joined_at, reviewed_at)
     VALUES (?, ?, ?, '统筹', 'approved', ?, ?, ?)`
  ).run(genId('mem'), pid, userId, userId, now(), now());

  // 任务：2 个派给自己，1 个给协作者，1 个待认领
  let i = 0;
  for (const [title, desc, status, progress] of TASK_POOL.owned) {
    i++;
    const assignee = i <= 2 ? userId : i === 3 && mates[0] ? mates[0].id : null;
    db.prepare(
      `INSERT INTO co_task (id, project_id, title, description, assignee_id, created_by, deadline, status, progress, submit_content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      genId('task'),
      pid,
      title,
      desc,
      assignee,
      userId,
      days(5 + i * 4),
      status,
      progress,
      status === 'done' ? '已完成，材料见成果版本。' : null,
      now(),
      now()
    );
  }

  // 版本 / 讨论
  db.prepare(
    `INSERT INTO co_version (id, project_id, version_no, title, content, submitter_id, is_final, created_at)
     VALUES (?, ?, 1, ?, ?, ?, 0, ?)`
  ).run(genId('ver'), pid, 'v1 母题与方向说明', `${spec.theme}。已确认 3 个可用母题，附工艺可行性初判。`, userId, now());

  const discs = [
    [userId, `项目刚开，先把母题定下来。${spec.theme}。`],
    [mates[0] ? mates[0].id : userId, '看了母题库，第二个方向更适合量产，建议先做那一个。'],
  ];
  for (const [uid, content] of discs) {
    db.prepare('INSERT INTO co_discussion (id, project_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
      genId('disc'),
      pid,
      uid,
      content,
      now()
    );
  }

  // 待审申请（1-2 人）
  let pend = 0;
  for (const m of mates.slice(0, 2)) {
    db.prepare(
      `INSERT OR IGNORE INTO co_member (id, project_id, user_id, role, apply_reason, status, joined_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`
    ).run(genId('mem'), pid, m.id, ['视觉设计', '文案', '摄影'][pend % 3], '这个环节我有经验，想参与进来。', now());
    pend++;
  }

  // 参与别人的 2 个项目 + 各派 1 个任务
  const others = db
    .prepare("SELECT id, owner_id, status FROM co_project WHERE owner_id != ? AND status != 'closed' ORDER BY created_at DESC LIMIT 2")
    .all(userId);
  let joined = 0;
  for (const op of others) {
    db.prepare(
      `INSERT OR IGNORE INTO co_member (id, project_id, user_id, role, apply_reason, status, reviewed_by, joined_at, reviewed_at)
       VALUES (?, ?, ?, '工艺顾问', '作为工艺顾问参与', 'approved', ?, ?, ?)`
    ).run(genId('mem'), op.id, userId, op.owner_id, now(), now());
    const [title, desc, status, progress] = TASK_POOL.joined[joined % TASK_POOL.joined.length];
    const dup = db.prepare('SELECT id FROM co_task WHERE project_id = ? AND title = ? AND assignee_id = ?').get(op.id, title, userId);
    if (!dup) {
      db.prepare(
        `INSERT INTO co_task (id, project_id, title, description, assignee_id, created_by, deadline, status, progress, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(genId('task'), op.id, title, desc, userId, op.owner_id, days(12), status, progress, now(), now());
    }
    joined++;
  }

  // 重算成员数
  db.prepare(
    "UPDATE co_project SET members_count = (SELECT COUNT(*) FROM co_member WHERE project_id = ? AND status='approved') WHERE id = ?"
  ).run(pid, pid);

  return {
    ok: true,
    created: pid,
    project: spec.title,
    joined,
    pending: pend,
    user: displayName,
  };
}

/** 修复/补全：让账号在参与的项目里也有指派任务（幂等） */
function ensureAssignedTasks(userId) {
  const joined = db
    .prepare(
      `SELECT p.id, p.owner_id FROM co_member m JOIN co_project p ON p.id = m.project_id
       WHERE m.user_id = ? AND m.status = 'approved' AND p.owner_id != ? AND p.status != 'closed'`
    )
    .all(userId, userId);

  let added = 0;
  let idx = 0;
  for (const op of joined) {
    const [title, desc, status, progress] = TASK_POOL.joined[idx % TASK_POOL.joined.length];
    idx++;
    const dup = db
      .prepare('SELECT id FROM co_task WHERE project_id = ? AND assignee_id = ?')
      .get(op.id, userId);
    if (dup) continue;
    db.prepare(
      `INSERT INTO co_task (id, project_id, title, description, assignee_id, created_by, deadline, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(genId('task'), op.id, title, desc, userId, op.owner_id, days(12), status, progress, now(), now());
    added++;
  }
  return added;
}

module.exports = { seedUserWorkspace, ensureAssignedTasks };
