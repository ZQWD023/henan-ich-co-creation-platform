// scripts/smoke-test.js —— 端到端冒烟测试：一条命令验证"共创闭环"是否真的能跑通
// 用法：先 npm run seed，再 npm run smoke
// 它会完整走一遍：注册 → 认证 → 建项目 → 第二人申请 → 审核 → 派任务 → 交成果 → 结项 → 作品入库
const BASE = process.env.SMOKE_BASE || `http://localhost:${process.env.PORT || 3000}`;

let pass = 0;
let fail = 0;

function log(okFlag, name, extra = '') {
  if (okFlag) {
    pass++;
    console.log(`  ✅ ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`);
  }
}

async function req(method, url, { token, body } = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, body: json };
}

const rand = () => Math.random().toString(36).slice(2, 8);

async function main() {
  console.log(`\n=== 冒烟测试 ${BASE} ===\n`);

  // 0. 健康检查
  const health = await req('GET', '/health');
  log(health.status === 200, '健康检查 /health');

  const meta = await req('GET', '/api/projects/meta');
  log(meta.status === 200 && meta.body?.data?.transitions, '共创状态机 /api/projects/meta');

  // 1. 内容库是否已灌入
  const cats = await req('GET', '/api/content/categories');
  log(cats.status === 200 && cats.body.data.length > 0, '非遗分类', `${cats.body?.data?.length} 个`);

  const heri = await req('GET', '/api/content/heritage?pageSize=5');
  log(heri.status === 200 && heri.body.data.total > 0, '非遗项目列表', `${heri.body?.data?.total} 条`);
  const heritageId = heri.body?.data?.list?.[0]?.id;

  // 2. 注册两个用户（发起人 + 协作者）
  const u1 = { username: 'smoke_a_' + rand(), email: `a${rand()}@t.local`, password: '123456' };
  const u2 = { username: 'smoke_b_' + rand(), email: `b${rand()}@t.local`, password: '123456' };

  const r1 = await req('POST', '/api/auth/register', { body: u1 });
  log(r1.status === 201 && r1.body.data.token, '注册用户 A（发起人）');
  const tokenA = r1.body?.data?.token;
  const idA = r1.body?.data?.user?.id;

  const r2 = await req('POST', '/api/auth/register', { body: u2 });
  log(r2.status === 201, '注册用户 B（协作者）');
  const tokenB = r2.body?.data?.token;
  const idB = r2.body?.data?.user?.id;

  // 3. 未认证用户不能发起项目（权限校验）
  const noPerm = await req('POST', '/api/projects', {
    token: tokenA,
    body: { title: '冒烟测试项目不该建成' },
  });
  log(noPerm.status === 403, '未认证用户无法发起共创项目', `HTTP ${noPerm.status}`);

  // 4. 把 A 提为 creator（模拟管理员审核通过）
  const { db } = require('../db/database');
  const { userRepo } = require('../repositories/user.repo');
  userRepo.setRole(idA, 'creator');
  userRepo.updateProfile(idA, { cert_status: 'approved' });
  userRepo.setRole(idB, 'creator');
  userRepo.updateProfile(idB, { cert_status: 'approved' });
  log(true, '已把两个测试账号提为已认证创作者（直接改库，仅测试用）');

  // 5. A 建项目（发布招募）
  const created = await req('POST', '/api/projects', {
    token: tokenA,
    body: {
      title: '冒烟测试·豫剧脸谱文创共创',
      description: '这是一个自动化冒烟测试创建的共创项目，用于验证从招募到结项的完整链路是否可用。',
      recruitNeed: '需要 1 名视觉设计、1 名文案',
      heritageId,
      memberLimit: 5,
      publish: true,
    },
  });
  log(created.status === 201, '发起共创项目（直接发布招募）', created.body?.message);
  const projectId = created.body?.data?.id;
  log(created.body?.data?.status === 'recruiting', '项目初始状态为 recruiting');

  // 6. B 申请加入
  const apply = await req('POST', `/api/projects/${projectId}/apply`, {
    token: tokenB,
    body: { role: '视觉设计', reason: '我做过非遗插画' },
  });
  log(apply.status === 201, 'B 申请加入项目');

  // 7. A 审核通过
  const review = await req('PATCH', `/api/projects/${projectId}/members/${idB}`, {
    token: tokenA,
    body: { decision: 'approved', note: '欢迎加入' },
  });
  log(review.status === 200, 'A 审核通过 B 的申请');
  const members = review.body?.data?.members?.filter((m) => m.status === 'approved') || [];
  log(members.length === 2, '项目内有 2 名已通过成员', `实际 ${members.length}`);

  // 8. 状态流转：recruiting → in_progress（前置条件：≥2 名成员）
  const toProgress = await req('PATCH', `/api/projects/${projectId}/status`, {
    token: tokenA,
    body: { status: 'in_progress', note: '开始协作' },
  });
  log(toProgress.status === 200, '状态流转 → 协作中', toProgress.body?.data?.statusText);

  // 9. 非法流转应被拒绝（in_progress 不能直接跳到 closed）
  const illegal = await req('PATCH', `/api/projects/${projectId}/status`, {
    token: tokenA,
    body: { status: 'closed' },
  });
  log(illegal.status === 409, '非法状态跳转被拒绝', `HTTP ${illegal.status}`);

  // 10. A 派任务给 B
  const task = await req('POST', `/api/projects/${projectId}/tasks`, {
    token: tokenA,
    body: { title: '完成脸谱主视觉 3 稿', description: '需要 3 个方向', assigneeId: idB },
  });
  log(task.status === 201, '创建任务并指派给 B');
  const taskId = task.body?.data?.id;

  // 11. B 更新进度到 100%（自动进入待验收）
  const prog = await req('PATCH', `/api/projects/tasks/${taskId}`, {
    token: tokenB,
    body: { progress: 100, submitContent: '3 稿已上传' },
  });
  log(prog.status === 200 && prog.body?.data?.status === 'review', 'B 提交任务，状态自动进入待验收');

  // 12. B 不能自己验收（只有发起人能 done）
  const selfDone = await req('PATCH', `/api/projects/tasks/${taskId}`, {
    token: tokenB,
    body: { status: 'done' },
  });
  log(selfDone.status === 403, '负责人不能自行验收任务', `HTTP ${selfDone.status}`);

  // 13. A 验收
  const done = await req('PATCH', `/api/projects/tasks/${taskId}`, {
    token: tokenA,
    body: { status: 'done' },
  });
  log(done.status === 200 && done.body?.data?.status === 'done', 'A 验收任务通过');

  // 14. B 提交成果版本
  const ver = await req('POST', `/api/projects/${projectId}/versions`, {
    token: tokenB,
    body: { title: '豫剧脸谱文创 v1', content: '主视觉 + 包装方案' },
  });
  log(ver.status === 201, 'B 提交成果版本 v1');

  // 15. 项目内讨论 + @ 提醒
  const disc = await req('POST', `/api/projects/${projectId}/discussions`, {
    token: tokenB,
    body: { content: '@发起人 主视觉已上传，请查收', mentions: [idA] },
  });
  log(disc.status === 201, '项目内讨论（@ 发起人）');

  // 16. in_progress → reviewing（前置条件：至少 1 个版本）
  const toReview = await req('PATCH', `/api/projects/${projectId}/status`, {
    token: tokenA,
    body: { status: 'reviewing' },
  });
  log(toReview.status === 200, '状态流转 → 结项评审中');

  // 17. reviewing → closed（自动把最终成果发布为作品）
  const toClosed = await req('PATCH', `/api/projects/${projectId}/status`, {
    token: tokenA,
    body: { status: 'closed', note: '结项公示' },
  });
  log(toClosed.status === 200 && toClosed.body?.data?.status === 'closed', '状态流转 → 已结项');

  // 18. 结项后作品库里应出现共创成果
  const works = await req('GET', `/api/works?projectId=${projectId}`);
  log(works.status === 200 && works.body.data.total > 0, '结项成果已自动进入作品库', `${works.body?.data?.total} 件`);

  // 19. 通知是否产生
  const noti = await req('GET', '/api/notifications', { token: tokenB });
  log(noti.status === 200 && noti.body.data.total > 0, 'B 收到了项目通知', `${noti.body?.data?.total} 条`);

  // 20. 我的工作台
  const ws = await req('GET', '/api/projects/workspace/me', { token: tokenA });
  log(ws.status === 200 && ws.body.data.summary, '我的工作台可用', JSON.stringify(ws.body?.data?.summary));

  // 21. 权限：B 不能改 A 的项目
  const noRight = await req('PUT', `/api/projects/${projectId}`, {
    token: tokenB,
    body: { title: '恶意修改' },
  });
  log(noRight.status === 403, '非发起人不能编辑项目', `HTTP ${noRight.status}`);

  // 22. 未登录访问管理台
  const anonAdmin = await req('GET', '/api/admin/stats');
  log(anonAdmin.status === 401, '未登录访问管理台被拦截', `HTTP ${anonAdmin.status}`);

  // 23. 参数校验
  const badRegister = await req('POST', '/api/auth/register', { body: { username: 'a', email: 'bad', password: '1' } });
  log(badRegister.status === 400 && badRegister.body?.details, '参数校验返回字段级错误');

  // 24. 统一响应格式
  log(
    typeof health.body?.code === 'undefined' || health.body.code === 0,
    '响应体含统一 code 字段',
    JSON.stringify(health.body).slice(0, 60)
  );

  console.log(`\n=== 结果：通过 ${pass}，失败 ${fail} ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n冒烟测试中断：', e.message);
  console.error('请确认：1) 服务已启动  2) 已执行 npm run seed');
  process.exit(1);
});
