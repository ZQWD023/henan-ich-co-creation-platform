// routes/projects.js —— 共创协作（平台核心模块）全部接口
//
// 接口总览（答辩时按这个顺序演示即可形成完整闭环）：
//   POST   /api/projects                       发起项目
//   PATCH  /api/projects/:id/status            状态流转（发布→协作→结项→公示）
//   POST   /api/projects/:id/apply             申请加入
//   PATCH  /api/projects/:id/members/:uid       审核成员
//   POST   /api/projects/:id/tasks              派任务
//   PATCH  /api/tasks/:taskId                   更新进度 / 提交成果
//   POST   /api/projects/:id/versions           提交成果版本
//   POST   /api/projects/:id/versions/:vid/final 指定最终版本
//   POST   /api/projects/:id/discussions        项目内讨论（@成员）
//   GET    /api/projects/workspace/me           我的工作台
const express = require('express');
const { ok, created, paginate } = require('../utils/response');
const { validate } = require('../utils/validate');
const { parsePage } = require('../utils/pagination');
const { asyncHandler } = require('../middleware/error');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { projectService, PROJECT_STATUS, STATUS_TEXT } = require('../services/project.service');

const router = express.Router();

/* ==================== 元信息 ==================== */
// GET /api/projects/meta —— 状态机与文字，前端可直接用来渲染流程条
router.get(
  '/meta',
  (req, res) => {
    const { TRANSITIONS, MEMBER_STATUS_TEXT, TASK_STATUS_TEXT } = projectService;
    return ok(res, {
      statuses: Object.entries(STATUS_TEXT).map(([value, text]) => ({ value, text })),
      transitions: TRANSITIONS,
      memberStatus: MEMBER_STATUS_TEXT,
      taskStatus: TASK_STATUS_TEXT,
    });
  }
);

/* ==================== 我的工作台 ==================== */
router.get(
  '/workspace/me',
  authenticateToken,
  asyncHandler(async (req, res) => ok(res, projectService.myWorkspace(req.user.id)))
);

router.get(
  '/tasks/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePage(req.query);
    const list = projectService.myTasks(req.user.id, { status: req.query.status, limit, offset });
    return ok(res, list, 'ok');
  })
);

/* ==================== 列表 / 详情 ==================== */
// GET /api/projects?status=&heritageId=&keyword=&sort=&mine=owned|joined
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const query = {
      status: req.query.status,
      heritageId: req.query.heritageId,
      keyword: req.query.keyword,
      sort: req.query.sort,
      limit,
      offset,
    };
    if (req.user && req.query.mine === 'owned') query.ownerId = req.user.id;
    if (req.user && req.query.mine === 'joined') query.memberOf = req.user.id;
    // 未指定状态时默认只看公开状态，避免草稿泄漏
    if (!query.status) {
      const { list, total } = projectService.list({ ...query, status: undefined });
      const visible = list.filter((p) => !['draft', 'cancelled'].includes(p.status));
      return paginate(res, { list: visible, total, page, pageSize });
    }
    const { list, total } = projectService.list(query);
    return paginate(res, { list, total, page, pageSize });
  })
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => ok(res, projectService.detail(req.params.id, req.user)))
);

/* ==================== 创建 / 编辑 / 状态 ==================== */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      title: { required: true, type: 'string', min: 4, max: 60, label: '项目标题' },
      description: { type: 'string', max: 3000, label: '项目描述' },
      recruitNeed: { type: 'string', max: 1000, label: '招募要求' },
      heritageId: { type: 'string', max: 64, label: '关联非遗项目' },
      coverUrl: { type: 'string', max: 500, label: '封面图' },
      memberLimit: { type: 'int', min: 2, max: 50, default: 10, label: '成员上限' },
      deadline: { type: 'datetime', label: '截止时间' },
      publish: { type: 'boolean', default: false, label: '是否立即发布' },
    });
    const result = projectService.create(req.user, body);
    return created(res, result, body.publish ? '项目已发布招募' : '项目已保存为草稿');
  })
);

router.put(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      title: { type: 'string', min: 4, max: 60, label: '项目标题' },
      description: { type: 'string', max: 3000, label: '项目描述' },
      recruitNeed: { type: 'string', max: 1000, label: '招募要求' },
      heritageId: { type: 'string', max: 64 },
      coverUrl: { type: 'string', max: 500 },
      memberLimit: { type: 'int', min: 2, max: 50 },
      deadline: { type: 'datetime' },
    });
    return ok(res, projectService.update(req.params.id, req.user, body), '项目已更新');
  })
);

// PATCH /api/projects/:id/status  { status: 'recruiting', note?: '' }
router.patch(
  '/:id/status',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      status: {
        required: true,
        type: 'string',
        enum: Object.values(PROJECT_STATUS),
        label: '目标状态',
      },
      note: { type: 'string', max: 200, label: '备注' },
    });
    const result = projectService.changeStatus(req.params.id, req.user, body.status, body.note);
    return ok(res, result, `项目已进入「${STATUS_TEXT[body.status]}」`);
  })
);

/* ==================== 成员管理 ==================== */
router.post(
  '/:id/apply',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      role: { type: 'string', max: 20, default: '设计', label: '意向分工' },
      reason: { type: 'string', max: 300, label: '申请理由' },
    });
    return created(res, projectService.apply(req.params.id, req.user, body), '申请已提交，等待发起人审核');
  })
);

router.get(
  '/:id/members',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const detail = projectService.detail(req.params.id, req.user);
    return ok(res, detail.members);
  })
);

// PATCH /api/projects/:id/members/:userId  { decision: 'approved'|'rejected', note? }
router.patch(
  '/:id/members/:userId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      decision: { required: true, type: 'string', enum: ['approved', 'rejected'], label: '审核结果' },
      note: { type: 'string', max: 200 },
    });
    const result = projectService.reviewMember(
      req.params.id,
      req.user,
      req.params.userId,
      body.decision,
      body.note
    );
    return ok(res, result, body.decision === 'approved' ? '已通过申请' : '已驳回申请');
  })
);

router.patch(
  '/:id/members/:userId/role',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, { role: { required: true, type: 'string', max: 20, label: '分工角色' } });
    return ok(res, projectService.changeMemberRole(req.params.id, req.user, req.params.userId, body.role), '分工已调整');
  })
);

// DELETE /api/projects/:id/members/:userId —— 移除成员
router.delete(
  '/:id/members/:userId',
  authenticateToken,
  asyncHandler(async (req, res) =>
    ok(res, projectService.removeMember(req.params.id, req.user, req.params.userId, 'removed'), '成员已移除')
  )
);

// POST /api/projects/:id/leave —— 主动退出
router.post(
  '/:id/leave',
  authenticateToken,
  asyncHandler(async (req, res) =>
    ok(res, projectService.removeMember(req.params.id, req.user, null, 'quit'), '已退出项目')
  )
);

/* ==================== 任务管理 ==================== */
router.get(
  '/:id/tasks',
  authenticateToken,
  asyncHandler(async (req, res) =>
    ok(res, projectService.listTasks(req.params.id, req.query, req.user))
  )
);

router.post(
  '/:id/tasks',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      title: { required: true, type: 'string', min: 2, max: 60, label: '任务名称' },
      description: { type: 'string', max: 1000, label: '任务说明' },
      assigneeId: { type: 'string', max: 64, label: '负责人' },
      deadline: { type: 'datetime', label: '截止时间' },
    });
    return created(res, projectService.createTask(req.params.id, req.user, body), '任务已创建');
  })
);

// PATCH /api/tasks/:taskId —— 改进度 / 提交阶段成果 / 验收
router.patch(
  '/tasks/:taskId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      title: { type: 'string', min: 2, max: 60 },
      description: { type: 'string', max: 1000 },
      status: { type: 'string', enum: ['todo', 'doing', 'review', 'done'] },
      progress: { type: 'int', min: 0, max: 100 },
      assigneeId: { type: 'string', max: 64 },
      deadline: { type: 'datetime' },
      submitContent: { type: 'string', max: 2000 },
      submitUrl: { type: 'string', max: 500 },
    });
    return ok(res, projectService.updateTask(req.params.taskId, req.user, body), '任务已更新');
  })
);

router.delete(
  '/tasks/:taskId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    projectService.deleteTask(req.params.taskId, req.user);
    return ok(res, null, '任务已删除');
  })
);

/* ==================== 版本与成果 ==================== */
router.get(
  '/:id/versions',
  optionalAuth,
  asyncHandler(async (req, res) => ok(res, projectService.listVersions(req.params.id, req.user)))
);

router.post(
  '/:id/versions',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      title: { required: true, type: 'string', min: 2, max: 80, label: '成果标题' },
      content: { type: 'string', max: 5000, label: '成果说明' },
      fileUrl: { type: 'string', max: 500, label: '成果文件' },
      coverUrl: { type: 'string', max: 500, label: '封面图' },
    });
    return created(res, projectService.createVersion(req.params.id, req.user, body), '成果版本已提交');
  })
);

router.post(
  '/:id/versions/:versionId/final',
  authenticateToken,
  asyncHandler(async (req, res) =>
    ok(res, projectService.markFinal(req.params.id, req.params.versionId, req.user), '已设为最终版本')
  )
);

/* ==================== 项目内讨论 ==================== */
router.get(
  '/:id/discussions',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { list, total } = projectService.listDiscussions(req.params.id, { limit, offset }, req.user);
    return paginate(res, { list, total, page, pageSize });
  })
);

router.post(
  '/:id/discussions',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      content: { required: true, type: 'string', min: 1, max: 1000, label: '讨论内容' },
      replyTo: { type: 'string', max: 64, label: '回复的讨论 ID' },
      mentions: { type: 'array', label: '@ 成员' },
    });
    return created(res, projectService.createDiscussion(req.params.id, req.user, body), '已发布');
  })
);

module.exports = router;
