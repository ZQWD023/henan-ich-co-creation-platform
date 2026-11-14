// routes/admin.js —— 平台管理后台（内容审核 / 用户管理 / 数据统计）
// 全部接口要求 admin 角色，统一由 requireRole('admin') 拦截
const express = require('express');
const { ok, paginate } = require('../utils/response');
const { validate } = require('../utils/validate');
const { parsePage } = require('../utils/pagination');
const { asyncHandler } = require('../middleware/error');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { db } = require('../db/database');
const { workRepo } = require('../repositories/work.repo');
const { projectRepo } = require('../repositories/project.repo');
const { userRepo } = require('../repositories/user.repo');
const { commentRepo, auditRepo } = require('../repositories/social.repo');
const { materialRepo } = require('../repositories/heritage.repo');
const { workService } = require('../services/work.service');
const { userService } = require('../services/user.service');
const { genId } = require('../utils/id');
const { AppError } = require('../utils/response');

const router = express.Router();

// 整个 /api/admin 都需要管理员
router.use(authenticateToken, requireRole('admin'));

function logAudit(adminId, targetType, targetId, action, note) {
  auditRepo.create({
    id: genId('aud'),
    admin_id: adminId,
    target_type: targetType,
    target_id: targetId,
    action,
    note: note || null,
  });
}

/* ==================== 数据看板 ==================== */
// GET /api/admin/stats —— 后台首页 8 个核心数字
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);

    const stats = {
      users: {
        total: userRepo.countAll(),
        creators: userRepo.countByRole('creator'),
        admins: userRepo.countByRole('admin'),
        newToday: db
          .prepare("SELECT COUNT(*) AS n FROM users WHERE date(created_at) = date('now','localtime')")
          .get().n,
        pendingCert: db
          .prepare("SELECT COUNT(*) AS n FROM user_certification WHERE status = 'pending'")
          .get().n,
      },
      works: {
        total: workRepo.countAll(),
        approved: workRepo.countByStatus('approved'),
        pending: workRepo.countByStatus('pending'),
        offline: workRepo.countByStatus('offline'),
      },
      projects: {
        total: projectRepo.countAll(),
        recruiting: projectRepo.countByStatus('recruiting'),
        inProgress: projectRepo.countByStatus('in_progress'),
        reviewing: projectRepo.countByStatus('reviewing'),
        closed: projectRepo.countByStatus('closed'),
      },
      interactions: {
        comments: commentRepo.countAll(),
        likes: db.prepare("SELECT COUNT(*) AS n FROM interaction WHERE action = 'like'").get().n,
        favorites: db.prepare("SELECT COUNT(*) AS n FROM interaction WHERE action = 'favorite'").get().n,
        follows: db.prepare("SELECT COUNT(*) AS n FROM interaction WHERE action = 'follow'").get().n,
      },
      content: {
        heritage: db.prepare('SELECT COUNT(*) AS n FROM heritage').get().n,
        categories: db.prepare('SELECT COUNT(*) AS n FROM category').get().n,
        inheritors: db.prepare('SELECT COUNT(*) AS n FROM inheritor').get().n,
        materials: materialRepo.countAll(),
      },
      traffic: {
        workViews: db.prepare('SELECT COALESCE(SUM(views_count),0) AS n FROM work').get().n,
        projectViews: db.prepare("SELECT COALESCE(SUM(views_count),0) AS n FROM co_project").get().n,
        heritageViews: db.prepare('SELECT COALESCE(SUM(popularity),0) AS n FROM heritage').get().n,
      },
      updatedAt: today,
    };
    return ok(res, stats);
  })
);

// GET /api/admin/stats/trend —— 近 7 天新增用户/作品/项目，给折线图用
router.get(
  '/stats/trend',
  asyncHandler(async (req, res) => {
    const days = Math.min(Number(req.query.days) || 7, 30);
    const rows = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      rows.push({
        date: d,
        users: db.prepare("SELECT COUNT(*) AS n FROM users WHERE date(created_at) = ?").get(d).n,
        works: db.prepare("SELECT COUNT(*) AS n FROM work WHERE date(created_at) = ?").get(d).n,
        projects: db.prepare("SELECT COUNT(*) AS n FROM co_project WHERE date(created_at) = ?").get(d).n,
        comments: db.prepare("SELECT COUNT(*) AS n FROM comment WHERE date(created_at) = ?").get(d).n,
      });
    }
    return ok(res, rows);
  })
);

/* ==================== 内容审核 ==================== */
// GET /api/admin/works?status=pending
router.get(
  '/works',
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    if (req.query.status === 'pending') {
      const { list, total } = workRepo.pending({ limit, offset });
      return paginate(res, { list, total, page, pageSize });
    }
    const { list, total } = workRepo.search({
      status: req.query.status,
      keyword: req.query.keyword,
      sortBy: 'w.created_at DESC',
      limit,
      offset,
    });
    return paginate(res, { list, total, page, pageSize });
  })
);

// PATCH /api/admin/works/:id/audit  { decision: 'approve'|'reject'|'offline', note }
router.patch(
  '/works/:id/audit',
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      decision: { required: true, type: 'string', enum: ['approve', 'reject', 'offline'], label: '审核结果' },
      note: { type: 'string', max: 200, label: '审核意见' },
    });
    const map = { approve: 'approved', reject: 'rejected', offline: 'offline' };
    const result = workService.setStatus(req.params.id, req.user, map[body.decision], body.note);
    logAudit(req.user.id, 'work', req.params.id, body.decision, body.note);
    return ok(res, result, '审核完成');
  })
);

// GET /api/admin/comments —— 全部评论（含待处理）
router.get(
  '/comments',
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { rows, total } = commentRepo.recent({ limit, offset });
    return paginate(res, { list: rows, total, page, pageSize });
  })
);

// PATCH /api/admin/comments/:id/hide —— 隐藏违规评论
router.patch(
  '/comments/:id/hide',
  asyncHandler(async (req, res) => {
    const c = commentRepo.findById(req.params.id);
    if (!c) throw AppError.notFound('评论不存在');
    commentRepo.setStatus(req.params.id, 'hidden');
    logAudit(req.user.id, 'comment', req.params.id, 'hide');
    return ok(res, null, '评论已隐藏');
  })
);

// PATCH /api/admin/projects/:id/offline —— 下架违规共创项目
router.patch(
  '/projects/:id/offline',
  asyncHandler(async (req, res) => {
    const p = projectRepo.findById(req.params.id);
    if (!p) throw AppError.notFound('项目不存在');
    projectRepo.setStatus(req.params.id, 'cancelled');
    logAudit(req.user.id, 'project', req.params.id, 'cancel');
    return ok(res, null, '项目已下架');
  })
);

/* ==================== 用户管理 ==================== */
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { list, total } = userRepo.list({
      keyword: req.query.keyword,
      role: req.query.role,
      status: req.query.status,
      limit,
      offset,
    });
    return paginate(res, { list, total, page, pageSize });
  })
);

// PATCH /api/admin/users/:id/status  { status: 'active'|'banned' }
router.patch(
  '/users/:id/status',
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      status: { required: true, type: 'string', enum: ['active', 'banned'], label: '账号状态' },
    });
    const target = userRepo.findById(req.params.id);
    if (!target) throw AppError.notFound('用户不存在');
    if (target.role === 'admin') throw AppError.forbidden('不能封禁管理员账号');
    userRepo.setStatus(req.params.id, body.status);
    logAudit(req.user.id, 'user', req.params.id, body.status);
    return ok(res, null, body.status === 'banned' ? '账号已封禁' : '账号已解封');
  })
);

// PATCH /api/admin/users/:id/role  { role: 'user'|'creator'|'admin' }
router.patch(
  '/users/:id/role',
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      role: { required: true, type: 'string', enum: ['user', 'creator', 'admin'], label: '角色' },
    });
    const target = userRepo.findById(req.params.id);
    if (!target) throw AppError.notFound('用户不存在');
    userRepo.setRole(req.params.id, body.role);
    logAudit(req.user.id, 'user', req.params.id, `role:${body.role}`);
    return ok(res, null, '角色已调整');
  })
);

/* ==================== 传承人认证审核 ==================== */
router.get(
  '/certifications',
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { list, total } = userService.listPendingCertifications({ limit, offset });
    return paginate(res, { list, total, page, pageSize });
  })
);

// PATCH /api/admin/certifications/:id  { decision: 'approved'|'rejected', note }
router.patch(
  '/certifications/:id',
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      decision: { required: true, type: 'string', enum: ['approved', 'rejected'], label: '审核结果' },
      note: { type: 'string', max: 200, label: '审核意见' },
    });
    const result = userService.reviewCertification(req.params.id, {
      status: body.decision,
      note: body.note,
      reviewerId: req.user.id,
    });
    logAudit(req.user.id, 'certification', req.params.id, body.decision, body.note);
    return ok(res, result, body.decision === 'approved' ? '已通过认证' : '已驳回认证');
  })
);

/* ==================== 操作日志 ==================== */
router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => ok(res, auditRepo.recent(Number(req.query.limit) || 50)))
);

module.exports = router;
