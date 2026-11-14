// scripts/demo-data.js —— 生成演示用的共创项目（让前端一启动就有内容可看）
// 用法：npm run demo
// 幂等：已存在同名项目会跳过
const { initDatabase, db } = require('../db/database');
const { userRepo } = require('../repositories/user.repo');
const { projectService } = require('../services/project.service');
const bcrypt = require('bcryptjs');

const PASSWORD = '123456';

/** 确保演示账号存在 */
function ensureUsers() {
  const defs = [
    ['user_demo_creator', 'creator', 'creator@ich.local', 'creator', '张砚秋（豫剧传承人）', 'approved'],
    ['user_demo_designer', 'designer', 'designer@ich.local', 'creator', '林一设计', 'approved'],
    ['user_demo_writer', 'writer', 'writer@ich.local', 'creator', '陈默文案', 'approved'],
    ['user_demo_user', 'user', 'user@ich.local', 'user', '小林同学', 'none'],
  ];
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role, cert_status, joined_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  defs.forEach(([id, username, email, role, name, cert]) =>
    stmt.run(id, username, email, hash, name, role, cert, new Date().toISOString())
  );
  const out = {};
  defs.forEach(([id, username]) => {
    const u = userRepo.findById(id);
    out[username] = { id: u.id, role: u.role, cert_status: u.cert_status, display_name: u.display_name, username };
  });
  return out;
}

function projectExists(title) {
  return db.prepare('SELECT id FROM co_project WHERE title = ?').get(title);
}

function run() {
  initDatabase();
  const users = ensureUsers();
  const owner = users.creator;
  const designer = users.designer;
  const writer = users.writer;
  const normal = users.user;

  const heritage = (name) => db.prepare('SELECT id, name FROM heritage WHERE name LIKE ? LIMIT 1').get(`%${name}%`);

  const yuju = heritage('豫剧');
  const junci = heritage('钧瓷');
  const bianxiu = heritage('汴绣');

  const created = [];

  /* ---------- 项目一：招募中（有 1 条待审核申请） ---------- */
  const t1 = '豫剧脸谱当代文创系列（招募中）';
  if (!projectExists(t1)) {
    const p = projectService.create(owner, {
      title: t1,
      description:
        '以豫剧脸谱的色彩与谱式为核心母题，做一组可用于日常生活的文创产品。已确定做杯具与包装两个方向，希望找到擅长插画与包装的设计伙伴，以及能把非遗故事讲清楚的文案。',
      recruitNeed: '视觉设计 1 名（会手绘或插画）、文案 1 名（熟悉戏曲或民俗）',
      heritageId: yuju ? yuju.id : null,
      memberLimit: 6,
      publish: true,
    });
    // 普通用户申请（等待审核）
    projectService.apply(p.id, normal, { role: '文案', reason: '我在校报写过戏曲专题，想参与文案整理' });
    created.push(`✅ 招募中项目：${t1}`);
  } else {
    created.push(`⏭ 已存在：${t1}`);
  }

  /* ---------- 项目二：协作中（2 名成员、3 个任务、1 个版本、讨论） ---------- */
  const t2 = '钧瓷「入窑一色」茶器共创（协作中）';
  if (!projectExists(t2)) {
    const p = projectService.create(owner, {
      title: t2,
      description:
        '以钧瓷窑变釉色为灵感，设计一套面向年轻人的现代茶器。目标是把「入窑一色、出窑万彩」的不可控之美，转译成可量产的器型与配色方案。',
      recruitNeed: '产品设计 1 名、文案 1 名',
      heritageId: junci ? junci.id : null,
      memberLimit: 5,
      publish: true,
    });

    projectService.apply(p.id, designer, { role: '设计', reason: '做过陶瓷品牌视觉，熟悉釉色还原' });
    projectService.reviewMember(p.id, owner, designer.id, 'approved', '作品集很匹配，欢迎');
    projectService.apply(p.id, writer, { role: '文案', reason: '写过非遗纪录片脚本' });
    projectService.reviewMember(p.id, owner, writer.id, 'approved', '文案就交给你了');

    projectService.changeStatus(p.id, owner, 'in_progress', '成员到位，进入协作');

    const taskA = projectService.createTask(p.id, owner, {
      title: '梳理钧瓷釉色的命名与色谱',
      description: '把传统釉色名称对应到可用的 HEX 色谱，输出 1 份对照表',
      assigneeId: writer.id,
    });
    const taskB = projectService.createTask(p.id, owner, {
      title: '茶器器型草图 3 款',
      description: '一款单人快客杯、一款双人套装、一款旅行装',
      assigneeId: designer.id,
    });
    projectService.createTask(p.id, owner, {
      title: '包装与视觉延展',
      description: '礼盒结构 + 腰封文案位',
      assigneeId: designer.id,
    });

    // 任务 A 走完整流程：进行中 → 待验收 → 已完成
    projectService.updateTask(taskA.id, writer, { status: 'doing', progress: 40 });
    projectService.updateTask(taskA.id, writer, { progress: 100, submitContent: '色谱对照表 v1 已上传，共 24 个釉色名' });
    projectService.updateTask(taskA.id, owner, { status: 'done' });
    projectService.updateTask(taskB.id, designer, { status: 'doing', progress: 30 });

    // 一个成果版本
    projectService.createVersion(p.id, designer, {
      title: '钧瓷茶器 器型方案 v1',
      content: '快客杯以直筒收口为主，保留釉色流散面；套装增加一只公道杯。附 3 张手绘草图。',
    });

    // 项目内讨论
    projectService.createDiscussion(p.id, designer, {
      content: '器型草图已上传，请大家看看快客杯的收口弧度是否够利落。',
    });
    projectService.createDiscussion(p.id, owner, {
      content: '@林一设计 收口可以再收 2mm，另外把底足做薄一点更符合现代审美。',
      mentions: [designer.id],
    });

    created.push(`✅ 协作中项目：${t2}（2 名成员 / 3 个任务 / 1 个版本 / 2 条讨论）`);
  } else {
    created.push(`⏭ 已存在：${t2}`);
  }

  /* ---------- 项目三：已结项（走完闭环，成果自动进作品库） ---------- */
  const t3 = '汴绣纹样丝巾共创（已结项）';
  if (!projectExists(t3)) {
    const p = projectService.create(owner, {
      title: t3,
      description:
        '从汴绣传统花卉题材中提取折枝与团花构图，重新排成适合方巾的连续纹样。面料用真丝，纹样以散套针、滚针绣制。',
      recruitNeed: '视觉设计 1 名',
      heritageId: bianxiu ? bianxiu.id : null,
      memberLimit: 4,
      publish: true,
    });

    projectService.apply(p.id, designer, { role: '设计', reason: '做过纺织纹样设计' });
    projectService.reviewMember(p.id, owner, designer.id, 'approved', '欢迎');
    projectService.changeStatus(p.id, owner, 'in_progress');

    const t = projectService.createTask(p.id, owner, { title: '完成丝巾纹样终稿', assigneeId: designer.id });
    projectService.updateTask(t.id, designer, { progress: 100, submitContent: '终稿已交付' });
    projectService.updateTask(t.id, owner, { status: 'done' });

    const v = projectService.createVersion(p.id, designer, {
      title: '汴绣纹样·真丝方巾 终稿',
      content: '90×90cm 真丝方巾，四边纹样对称，中心团花。配色取汴绣传统的赭红、石青与米白。',
    });
    projectService.markFinal(p.id, v.id, owner);

    projectService.changeStatus(p.id, owner, 'reviewing');
    projectService.changeStatus(p.id, owner, 'closed', '成果公示');

    created.push(`✅ 已结项项目：${t3}（成果已自动发布为作品）`);
  } else {
    created.push(`⏭ 已存在：${t3}`);
  }

  console.log('\n=== 演示数据生成完成 ===');
  created.forEach((c) => console.log('  ' + c));
  console.log('\n  演示账号（密码均为 123456）：');
  console.log('    admin    管理员');
  console.log('    creator  发起人（张砚秋，已认证传承人）');
  console.log('    designer 设计（林一设计）');
  console.log('    writer   文案（陈默文案）');
  console.log('    user     普通用户（小林同学，未认证）');
  console.log('');

  const stats = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM co_project) AS projects,
              (SELECT COUNT(*) FROM co_member) AS members,
              (SELECT COUNT(*) FROM co_task) AS tasks,
              (SELECT COUNT(*) FROM co_version) AS versions,
              (SELECT COUNT(*) FROM co_discussion) AS discussions`
    )
    .get();
  console.log('  当前数据：', JSON.stringify(stats));
}

if (require.main === module) {
  try {
    run();
  } catch (e) {
    console.error('生成演示数据失败：', e.message);
    process.exit(1);
  }
}

module.exports = { run };
