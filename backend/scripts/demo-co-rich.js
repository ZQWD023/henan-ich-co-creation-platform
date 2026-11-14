// scripts/demo-co-rich.js —— 把共创域的数据做「厚」：让项目有真实进度、任务、版本、讨论，
// 并让演示账号 creator 的工作台不再全是 0（有参与的项目 / 待审核申请 / 待办任务）。
//
// 用法：cd backend && node scripts/demo-co-rich.js
// 幂等：按标题识别已存在的项目，已存在则补齐缺失的任务/成员/版本/讨论，不会重复创建。
const { db } = require('../db/database');
const { genId } = require('../utils/id');

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const days = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10) + ' 23:59:59';

/* ---------------- 0. 账号 ---------------- */
const USERS = [
  ['user_demo_creator', 'creator', 'creator@ich.local', '张砚秋（豫剧传承人）'],
  ['user_demo_designer', 'designer', 'designer@ich.local', '林一一（视觉设计）'],
  ['user_demo_writer', 'writer', 'writer@ich.local', '陈墨白（文案）'],
  ['user_demo_user', 'user', 'user@ich.local', '小林同学'],
  ['user_demo_admin', 'admin', 'admin@ich.local', '平台管理员'],
];
function ensureUsers() {
  const ins = db.prepare(
    `INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role, cert_status, status, joined_date)
     VALUES (?, ?, ?, ?, ?, 'creator', 'approved', 'active', ?)`
  );
  const hash = require('bcryptjs').hashSync('123456', 10);
  for (const [id, username, email, name] of USERS) ins.run(id, username, email, hash, name, now());
  // admin 角色单独修正
  db.prepare("UPDATE users SET role='admin' WHERE id='user_demo_admin'").run();
  return Object.fromEntries(USERS.map(([id, username]) => [username, { id, name: USERS.find((u) => u[0] === id)[3] }]));
}

/* ---------------- 1. 项目定义 ---------------- */
// 每个项目：标题、状态、非遗、说明、招募、人数上限、截止、封面、任务清单、成员、版本、讨论
const PROJECTS = [
  {
    title: '钧瓷「入窑一色」茶器共创',
    heritage: 'junci',
    owner: 'creator',
    status: 'in_progress',
    desc: '以钧瓷窑变釉色为灵感，设计一套面向年轻人的现代茶器。目标是把「入窑一色、出窑万彩」的不可控之美，转译成可量产的器型与配色方案。',
    need: '产品设计 1 名（会建模）、文案 1 名（懂茶文化）',
    limit: 5,
    deadline: days(23),
    members: [
      ['user_demo_creator', '统筹', 'approved'],
      ['user_demo_designer', '器型设计', 'approved'],
      ['user_demo_writer', '文案', 'approved'],
      ['user_demo_user', '摄影', 'pending'],
    ],
    tasks: [
      ['釉色样本采集与比对', '去神垕镇采集 20 组窑变釉样本，记录烧成温度与气氛', 'user_demo_creator', 'done', 100],
      ['器型草图 3 版', '盖碗 / 公道杯 / 品茗杯，各出 3 版草图', 'user_demo_designer', 'done', 100],
      ['茶器包装方案', '外盒 + 内衬，需考虑运输与展出两种场景', 'user_demo_designer', 'doing', 60],
      ['产品故事文案', '讲清「入窑一色、出窑万彩」的工艺不可控性', 'user_demo_writer', 'review', 100],
      ['拍摄与详情页', '成品拍摄 12 张，含细节与使用场景', 'user_demo_user', 'todo', 0],
    ],
    versions: [
      ['v1 釉色样本册', '整理了 20 组窑变釉样本，标注温度、气氛与呈色', 'user_demo_creator', 0],
      ['v2 器型与包装提案', '盖碗为主视觉，包装用宣纸质感 + 金线压印', 'user_demo_designer', 0],
    ],
    discussions: [
      ['user_demo_designer', '盖碗的盖钮想做成钧瓷常见的「乳钉」，会不会太传统？'],
      ['user_demo_creator', '乳钉其实很耐看，配现代极简的杯身反而有对比，可以先出一版看看。'],
      ['user_demo_writer', '文案我按「一窑一色、不可复制」的方向写了一版，放在版本里了。'],
    ],
  },
  {
    title: '豫剧脸谱当代插画系列',
    heritage: 'yuju',
    owner: 'designer',
    status: 'recruiting',
    desc: '以豫剧脸谱的色彩与谱式为核心母题，做一组可用于日常生活的文创产品。已确定杯具与包装两个方向，希望找到擅长插画与包装的设计伙伴。',
    need: '视觉设计 1 名（手绘/插画）、文案 1 名（熟悉戏曲或民俗）',
    limit: 6,
    deadline: days(35),
    members: [
      ['user_demo_creator', '统筹', 'approved'],
      ['user_demo_admin', '设计', 'pending'],
      ['user_demo_user', '文案', 'pending'],
    ],
    tasks: [
      ['脸谱谱式梳理（红脸/黑脸/花脸）', '整理 12 种常见谱式，标注寓意与用色', 'user_demo_creator', 'done', 100],
      ['插画线稿 6 张', '每张对应一种谱式，风格：国潮但不过度装饰', 'user_demo_designer', 'doing', 40],
      ['包装结构设计', '杯具外盒，可平铺展示', null, 'todo', 0],
    ],
    versions: [['v1 谱式资料包', '12 种谱式的寓意、用色与代表剧目', 'user_demo_creator', 0]],
    discussions: [
      ['user_demo_creator', '这个项目还在招募，设计伙伴可以直接申请，我会尽快审。'],
      ['user_demo_user', '想参与文案部分，主要是想把每个谱式的故事写短一点。'],
    ],
  },
  {
    title: '汴绣纹样丝巾共创',
    heritage: 'bianxiu',
    owner: 'writer',
    status: 'closed',
    desc: '从汴绣传统花卉题材中提取折枝与团花构图，重新排成适合方巾的连续纹样。面料用真丝，纹样以散套针、滚针绣制。',
    need: '视觉设计 1 名',
    limit: 4,
    deadline: days(-12),
    members: [
      ['user_demo_creator', '统筹', 'approved'],
      ['user_demo_designer', '纹样设计', 'approved'],
    ],
    tasks: [
      ['母题提取（折枝/团花）', '从 8 件传统绣品中提取 12 个可用母题', 'user_demo_designer', 'done', 100],
      ['四方连续排布', '90×90cm 方巾，四边留白 6cm', 'user_demo_designer', 'done', 100],
      ['打样与绣制验收', '真丝 16 姆米，散套针 + 滚针', 'user_demo_creator', 'done', 100],
    ],
    versions: [
      ['v1 母题库', '12 个母题 + 出处说明', 'user_demo_designer', 0],
      ['v2 终版纹样（已打样）', '四方连续 + 四角折枝，已出 2 条样巾', 'user_demo_designer', 1],
    ],
    discussions: [['user_demo_creator', '样巾收到了，绣工很稳，这个项目就此结项，感谢两位。']],
  },
  {
    title: '唐三彩「丝路驼铃」家居摆件',
    heritage: 'tangsancai',
    owner: 'creator',
    status: 'in_progress',
    desc: '把唐三彩的骆驼、胡人俑造型抽象化，做成玄关摆件与香插。保留黄绿白三彩釉，但弱化写实细节。',
    need: '产品设计 1 名、工艺顾问 1 名',
    limit: 5,
    deadline: days(18),
    members: [
      ['user_demo_creator', '统筹', 'approved'],
      ['user_demo_designer', '造型设计', 'approved'],
      ['user_demo_writer', '文案', 'approved'],
    ],
    tasks: [
      ['三彩釉色复原比对', '按黄绿白三色，比对 6 件馆藏', 'user_demo_creator', 'done', 100],
      ['摆件造型 2 版（骆驼/香插）', '抽象化，保留驼峰与铃铛两个识别点', 'user_demo_designer', 'doing', 70],
      ['香插开模', '找宜阳的窑口试模', null, 'todo', 0],
      ['详情页文案', '讲丝绸之路与三彩的关系', 'user_demo_writer', 'todo', 0],
    ],
    versions: [['v1 造型提案', '两版造型 + 釉色对照表', 'user_demo_designer', 0]],
    discussions: [
      ['user_demo_admin', '这个题材很适合做伴手礼，建议同时考虑礼盒装。'],
      ['user_demo_creator', '礼盒我先记在任务里，等造型定了再加。'],
    ],
  },
  {
    title: '朱仙镇木版年画门神新绘',
    heritage: 'zhuxianzhen-nianhua',
    owner: 'designer',
    status: 'reviewing',
    desc: '重绘一对门神（秦琼、尉迟恭），保留木版套色的用色逻辑与线条语言，但把表情与姿态调得更适合现代家居张贴。',
    need: '插画 1 名、印刷工艺顾问 1 名',
    limit: 4,
    deadline: days(6),
    members: [
      ['user_demo_creator', '统筹', 'approved'],
      ['user_demo_designer', '重绘', 'approved'],
    ],
    tasks: [
      ['原作纹样与用色分析', '拆解 5 套传统版的门神结构与设色', 'user_demo_creator', 'done', 100],
      ['门神重绘线稿', '两版：传统端正版 / 轻松版', 'user_demo_designer', 'done', 100],
      ['套色打样', '5 色套印，纸用泾县宣', 'user_demo_designer', 'review', 100],
    ],
    versions: [
      ['v1 线稿', '两版线稿 + 用色标注', 'user_demo_designer', 0],
      ['v2 套色样张', '5 色套印样张，已寄出', 'user_demo_designer', 1],
    ],
    discussions: [
      ['user_demo_designer', '套色样张寄出了，红色那版比预想的稳。'],
      ['user_demo_creator', '收到后我们走结项评审。'],
    ],
  },
  {
    title: '信阳毛尖「明前」茶包设计',
    heritage: 'xinyang-maojian',
    owner: 'designer',
    status: 'recruiting',
    desc: '给信阳毛尖做一套明前茶的便携茶包与手提袋，强调「一芽一叶」的采摘标准与炒制香气。',
    need: '包装设计 1 名、摄影 1 名',
    limit: 4,
    deadline: days(41),
    members: [['user_demo_creator', '统筹', 'approved']],
    tasks: [
      ['包装方向调研', '看 10 个同类茶品牌的包装策略', 'user_demo_creator', 'doing', 30],
      ['茶包材质测试', '玉米纤维 vs 无纺布，比较透香与价格', null, 'todo', 0],
    ],
    versions: [],
    discussions: [['user_demo_creator', '还在起步阶段，欢迎做包装的朋友申请。']],
  },
];

const STATUS_PROGRESS = { recruiting: 0, in_progress: 0, reviewing: 0, closed: 100 };

/* ---------------- 2. 写入 ---------------- */
function resetCoData() {
  // 只清共创域（保留用户与非遗内容），保证演示数据干净、可重复生成
  for (const t of ['co_discussion', 'co_version', 'co_task', 'co_member', 'co_project']) {
    db.prepare('DELETE FROM ' + t).run();
  }
}

function main() {
  const users = ensureUsers();
  if (!process.argv.includes('--keep')) resetCoData();

  const insProject = db.prepare(
    `INSERT INTO co_project (id, owner_id, heritage_id, title, description, recruit_need, member_limit, deadline, status, members_count, is_featured, created_at, updated_at, closed_at)
     VALUES (@id, @owner_id, @heritage_id, @title, @description, @recruit_need, @member_limit, @deadline, @status, @members_count, @is_featured, @created_at, @updated_at, @closed_at)`
  );
  const insMember = db.prepare(
    `INSERT OR IGNORE INTO co_member (id, project_id, user_id, role, apply_reason, status, reviewed_by, joined_at, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insTask = db.prepare(
    `INSERT INTO co_task (id, project_id, title, description, assignee_id, created_by, deadline, status, progress, submit_content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insVersion = db.prepare(
    `INSERT INTO co_version (id, project_id, version_no, title, content, submitter_id, is_final, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insDisc = db.prepare(`INSERT INTO co_discussion (id, project_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)`);

  let created = 0;
  let filled = 0;

  for (const p of PROJECTS) {
    let row = db.prepare('SELECT * FROM co_project WHERE title = ?').get(p.title);
    let pid;
    if (!row) {
      pid = genId('proj');
      insProject.run({
        id: pid,
        owner_id: (users[p.owner || 'creator'] || users.creator).id,
        heritage_id: p.heritage,
        title: p.title,
        description: p.desc,
        recruit_need: p.need,
        member_limit: p.limit,
        deadline: p.deadline,
        status: p.status,
        members_count: 1,
        is_featured: p.status === 'in_progress' ? 1 : 0,
        created_at: now(),
        updated_at: now(),
        closed_at: p.status === 'closed' ? now() : null,
      });
      created++;
    } else {
      pid = row.id;
      db.prepare('UPDATE co_project SET status=?, deadline=?, recruit_need=?, description=? WHERE id=?').run(
        p.status,
        p.deadline,
        p.need,
        p.desc,
        pid
      );
      filled++;
    }

    // 成员（发起人自动成为统筹）
    const ownerUser = users[p.owner || 'creator'] || users.creator;
    insMember.run(genId('mem'), pid, ownerUser.id, '统筹', null, 'approved', ownerUser.id, now(), now());
    for (const [uid, role, status] of p.members) {
      if (uid === ownerUser.id) continue;
      insMember.run(
        genId('mem'),
        pid,
        uid,
        role,
        status === 'pending' ? '希望参与这个项目的这一环，有我擅长的部分。' : null,
        status,
        status === 'pending' ? null : users.creator.id,
        now(),
        status === 'pending' ? null : now()
      );
    }
    const approved = db.prepare("SELECT COUNT(*) n FROM co_member WHERE project_id = ? AND status='approved'").get(pid).n;
    db.prepare('UPDATE co_project SET members_count = ? WHERE id = ?').run(approved, pid);

    // 任务
    const hasTask = db.prepare('SELECT COUNT(*) n FROM co_task WHERE project_id = ?').get(pid).n;
    if (!hasTask) {
      let i = 0;
      for (const [title, desc, assignee, status, progress] of p.tasks) {
        i++;
        insTask.run(
          genId('task'),
          pid,
          title,
          desc,
          assignee ? users[String(assignee).replace('user_demo_', '')]?.id || assignee : null,
          ownerUser.id,
          days(7 + i * 3),
          status,
          progress,
          status === 'done' ? '已完成，材料见版本区。' : null,
          now(),
          now()
        );
      }
    }

    // 版本
    const hasVer = db.prepare('SELECT COUNT(*) n FROM co_version WHERE project_id = ?').get(pid).n;
    if (!hasVer) {
      let no = 0;
      for (const [title, content, submitter, isFinal] of p.versions) {
        no++;
        insVersion.run(genId('ver'), pid, no, title, content, users[String(submitter).replace('user_demo_', '')]?.id || submitter, isFinal, now());
      }
    }

    // 讨论
    const hasDisc = db.prepare('SELECT COUNT(*) n FROM co_discussion WHERE project_id = ?').get(pid).n;
    if (!hasDisc) {
      for (const [uid, content] of p.discussions) {
        insDisc.run(genId('disc'), pid, users[String(uid).replace('user_demo_', '')]?.id || uid, content, now());
      }
    }
  }

  /* ---------------- 3. 让 creator 参与别人的项目（工作台「我参与的」不为 0） ---------------- */
  const otherProjects = db
    .prepare("SELECT id, title, owner_id FROM co_project WHERE owner_id != ? ORDER BY created_at DESC")
    .all(users.creator.id);
  let joined = 0;
  for (const op of otherProjects.slice(0, 2)) {
    insMember.run(genId('mem'), op.id, users.creator.id, '顾问', '作为非遗工艺顾问参与', 'approved', op.owner_id, now(), now());
    joined++;
  }

  // 如果别人的项目不够，至少让 creator 加入两个非自有演示项目
  if (joined < 2) {
    const extra = db
      .prepare("SELECT id, owner_id FROM co_project WHERE owner_id != ? LIMIT ?")
      .all(users.creator.id, 2 - joined);
    for (const e of extra) {
      insMember.run(genId('mem'), e.id, users.creator.id, '顾问', '作为非遗工艺顾问参与', 'approved', e.owner_id, now(), now());
      joined++;
    }
  }

  /* ---------------- 3.5 给工作台补"待审核 / 待办"，让数字真的有内容 ---------------- */
  const pidOf = (title) => (db.prepare('SELECT id FROM co_project WHERE title = ?').get(title) || {}).id;

  const EXTRA_MEMBERS = [
    ['钧瓷「入窑一色」茶器共创', 'user_demo_admin', '工艺顾问', 'pending'],
    ['唐三彩「丝路驼铃」家居摆件', 'user_demo_user', '摄影', 'pending'],
    ['唐三彩「丝路驼铃」家居摆件', 'user_demo_admin', '渠道对接', 'pending'],
  ];
  for (const [title, uid, role, status] of EXTRA_MEMBERS) {
    const pid = pidOf(title);
    if (!pid) continue;
    const dup = db.prepare('SELECT id FROM co_member WHERE project_id = ? AND user_id = ?').get(pid, uid);
    if (dup) continue;
    insMember.run(genId('mem'), pid, uid, role, '这个环节我有经验，想参与进来。', status, null, now(), null);
  }

  const EXTRA_TASKS = [
    ['钧瓷「入窑一色」茶器共创', '包装打样对接', '联系 2 家包装厂各出 1 版样；重点是内衬能否固定盖碗', 'review', 100],
    ['钧瓷「入窑一色」茶器共创', '烧成曲线说明', '把「入窑一色、出窑万彩」写成可读的工艺说明', 'doing', 55],
    ['唐三彩「丝路驼铃」家居摆件', '香插开模跟进', '与宜阳窑口确认开模排期（约 10 天）', 'doing', 40],
    ['朱仙镇木版年画门神新绘', '套色样张验收', '核对 5 色套印是否对版、有无跑色', 'review', 100],
    ['豫剧脸谱当代插画系列', '谱式释义校对', '核对 12 种谱式的寓意与代表剧目', 'todo', 0],
  ];
  let extraTasks = 0;
  for (const [title, tTitle, desc, status, progress] of EXTRA_TASKS) {
    const pid = pidOf(title);
    if (!pid) continue;
    const dup = db.prepare('SELECT id FROM co_task WHERE project_id = ? AND title = ?').get(pid, tTitle);
    if (dup) continue;
    insTask.run(
      genId('task'),
      pid,
      tTitle,
      desc,
      users.creator.id,
      users.creator.id,
      days(9),
      status,
      progress,
      status === 'review' ? '已提交，等待发起人验收。' : null,
      now(),
      now()
    );
    extraTasks++;
  }

  /* ---------------- 4. 进度重算（任务完成率） ---------------- */
  const projects = db.prepare('SELECT id, status FROM co_project').all();
  for (const pr of projects) {
    const t = db.prepare('SELECT COUNT(*) n FROM co_task WHERE project_id = ?').get(pr.id).n;
    const d = db.prepare("SELECT COUNT(*) n FROM co_task WHERE project_id = ? AND status='done'").get(pr.id).n;
    const progress = pr.status === 'closed' ? 100 : t ? Math.round((d / t) * 100) : 0;
    db.prepare('UPDATE co_project SET members_count = (SELECT COUNT(*) FROM co_member WHERE project_id=? AND status=\'approved\') WHERE id=?').run(
      pr.id,
      pr.id
    );
  }

  /* ---------------- 5. 汇报 ---------------- */
  const stat = (sql, ...args) => db.prepare(sql).get(...args).n;
  console.log('=== 共创域数据（demo-co-rich）===');
  console.log('项目：', stat('SELECT COUNT(*) n FROM co_project'));
  console.log('成员：', stat('SELECT COUNT(*) n FROM co_member'), '（其中待审核', stat("SELECT COUNT(*) n FROM co_member WHERE status='pending'"), '）');
  console.log('任务：', stat('SELECT COUNT(*) n FROM co_task'), '（完成', stat("SELECT COUNT(*) n FROM co_task WHERE status='done'"), '）');
  console.log('版本：', stat('SELECT COUNT(*) n FROM co_version'), ' 讨论：', stat('SELECT COUNT(*) n FROM co_discussion'));
  console.log(`新建项目 ${created} 个，补齐 ${filled} 个，creator 参与 ${joined} 个别人的项目`);
  console.log('\ncreator 的工作台预览：');
  const owned = db.prepare("SELECT COUNT(*) n FROM co_project WHERE owner_id='user_demo_creator'").get().n;
  const myJoin = db
    .prepare("SELECT COUNT(*) n FROM co_member m JOIN co_project p ON p.id=m.project_id WHERE m.user_id='user_demo_creator' AND m.status='approved' AND p.owner_id!='user_demo_creator'")
    .get().n;
  const pending = db
    .prepare("SELECT COUNT(*) n FROM co_member m JOIN co_project p ON p.id=m.project_id WHERE p.owner_id='user_demo_creator' AND m.status='pending'")
    .get().n;
  const todo = db
    .prepare("SELECT COUNT(*) n FROM co_task WHERE assignee_id='user_demo_creator' AND status IN ('todo','doing','review')")
    .get().n;
  console.log(`  我发起的 ${owned} / 我参与的 ${myJoin} / 待我审核 ${pending} / 我的待办 ${todo}`);
}

main();
