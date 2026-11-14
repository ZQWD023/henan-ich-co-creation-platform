// routes/works.js —— 作品接口
const express = require('express');
const { ok, created, paginate } = require('../utils/response');
const { validate } = require('../utils/validate');
const { parsePage } = require('../utils/pagination');
const { asyncHandler } = require('../middleware/error');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { workService } = require('../services/work.service');

const router = express.Router();

// GET /api/works?heritageId=&projectId=&workType=&keyword=&sort=&mine=1
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { list, total } = workService.list(
      {
        heritageId: req.query.heritageId,
        projectId: req.query.projectId,
        workType: req.query.workType,
        keyword: req.query.keyword,
        sort: req.query.sort,
        status: req.query.status,
        userId: req.query.userId,
        mine: req.query.mine === '1' || req.query.mine === 'true',
        limit,
        offset,
      },
      req.user
    );
    return paginate(res, { list, total, page, pageSize });
  })
);

// GET /api/works/types
router.get(
  '/types',
  asyncHandler(async (req, res) => ok(res, workService.workTypes()))
);

// GET /api/works/mine —— 我的作品（含未过审）
router.get(
  '/mine',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { list, total } = workService.myWorks(req.user.id, { limit, offset });
    return paginate(res, { list, total, page, pageSize });
  })
);

// POST /api/works —— 发布作品
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      title: { required: true, type: 'string', min: 2, max: 60, label: '作品标题' },
      summary: { type: 'string', max: 500, label: '作品简介' },
      content: { type: 'string', max: 5000, label: '作品正文' },
      workType: { type: 'string', max: 30, label: '作品类型' },
      heritageId: { type: 'string', max: 64, label: '关联非遗项目' },
      projectId: { type: 'string', max: 64, label: '关联共创项目' },
      coverUrl: { type: 'string', max: 500, label: '封面图' },
      fileUrl: { type: 'string', max: 500, label: '作品文件' },
      tags: { type: 'array', label: '标签' },
      topics: { type: 'array', label: '话题' },
    });
    return created(res, workService.create(req.user, body), '作品已提交');
  })
);

// GET /api/works/:id
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => ok(res, workService.detail(req.params.id, req.user)))
);

// PUT /api/works/:id
router.put(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      title: { type: 'string', min: 2, max: 60 },
      summary: { type: 'string', max: 500 },
      content: { type: 'string', max: 5000 },
      workType: { type: 'string', max: 30 },
      heritageId: { type: 'string', max: 64 },
      coverUrl: { type: 'string', max: 500 },
      fileUrl: { type: 'string', max: 500 },
      tags: { type: 'array' },
    });
    return ok(res, workService.update(req.params.id, req.user, body), '作品已更新');
  })
);

// PATCH /api/works/:id/status  { status, note } —— 上下架 / 审核
router.patch(
  '/:id/status',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      status: { required: true, type: 'string', enum: ['approved', 'rejected', 'offline', 'pending'], label: '状态' },
      note: { type: 'string', max: 200, label: '审核意见' },
    });
    return ok(res, workService.setStatus(req.params.id, req.user, body.status, body.note), '状态已更新');
  })
);

// DELETE /api/works/:id
router.delete(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    workService.remove(req.params.id, req.user);
    return ok(res, null, '作品已删除');
  })
);

// POST /api/works/:id/like
router.post(
  '/:id/like',
  authenticateToken,
  asyncHandler(async (req, res) => ok(res, workService.like(req.params.id, req.user), '点赞成功'))
);

// DELETE /api/works/:id/like
router.delete(
  '/:id/like',
  authenticateToken,
  asyncHandler(async (req, res) => ok(res, workService.unlike(req.params.id, req.user), '已取消点赞'))
);

// POST /api/works/:id/favorite
router.post(
  '/:id/favorite',
  authenticateToken,
  asyncHandler(async (req, res) => ok(res, workService.favorite(req.params.id, req.user), '收藏成功'))
);

// DELETE /api/works/:id/favorite
router.delete(
  '/:id/favorite',
  authenticateToken,
  asyncHandler(async (req, res) => ok(res, workService.unfavorite(req.params.id, req.user), '已取消收藏'))
);

module.exports = router;
