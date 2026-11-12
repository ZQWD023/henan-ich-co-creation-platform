// routes/heritage.js —— 内容库路由（分类 / 非遗项目 / 传承人 / 素材 / 活动 / 资讯 / 成就）
const express = require('express');
const { ok, created } = require('../utils/response');
const { validate } = require('../utils/validate');
const { parsePage } = require('../utils/pagination');
const { asyncHandler } = require('../middleware/error');
const { authenticateToken, optionalAuth, requireRole } = require('../middleware/auth');
const { heritageService } = require('../services/heritage.service');

const router = express.Router();

/* ==================== 分类 ==================== */
// GET /api/content/categories
router.get(
  '/categories',
  asyncHandler(async (req, res) => ok(res, heritageService.listCategories()))
);

/* ==================== 非遗项目 ==================== */
// GET /api/content/heritage?category=&region=&level=&keyword=&sort=&page=&pageSize=
router.get(
  '/heritage',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { list, total } = heritageService.listHeritage({
      category: req.query.category,
      region: req.query.region,
      level: req.query.level,
      keyword: req.query.keyword,
      sort: req.query.sort,
      limit,
      offset,
    });
    const { paginate } = require('../utils/response');
    return paginate(res, { list, total, page, pageSize });
  })
);

// GET /api/content/heritage/regions  必须在 /:id 之前注册，否则会被当成 id
router.get(
  '/heritage/regions',
  asyncHandler(async (req, res) => ok(res, heritageService.getRegions()))
);

// GET /api/content/heritage/:id
router.get(
  '/heritage/:id',
  optionalAuth,
  asyncHandler(async (req, res) => ok(res, heritageService.getHeritageDetail(req.params.id)))
);

/* ==================== 传承人 ==================== */
router.get(
  '/inheritors',
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { list, total } = heritageService.listInheritors({
      heritageId: req.query.heritageId,
      level: req.query.level,
      keyword: req.query.keyword,
      limit,
      offset,
    });
    const { paginate } = require('../utils/response');
    return paginate(res, { list, total, page, pageSize });
  })
);

router.get(
  '/inheritors/:id',
  asyncHandler(async (req, res) => ok(res, heritageService.getInheritorDetail(req.params.id)))
);

/* ==================== 公共素材库 ==================== */
router.get(
  '/materials',
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { list, total } = heritageService.listMaterials({
      type: req.query.type,
      heritageId: req.query.heritageId,
      keyword: req.query.keyword,
      limit,
      offset,
    });
    const { paginate } = require('../utils/response');
    return paginate(res, { list, total, page, pageSize });
  })
);

router.post(
  '/materials',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      title: { required: true, type: 'string', min: 2, max: 80, label: '素材名称' },
      fileUrl: { required: true, type: 'string', max: 500, label: '文件地址' },
      type: { type: 'string', enum: ['pattern', 'audio', 'doc'], default: 'pattern', label: '素材类型' },
      heritageId: { type: 'string', max: 64 },
      coverUrl: { type: 'string', max: 500 },
      sizeBytes: { type: 'int', min: 0 },
    });
    return created(res, await heritageService.createMaterial(req.user.id, body), '素材上传成功');
  })
);

router.delete(
  '/materials/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    heritageService.deleteMaterial(req.params.id, req.user);
    return ok(res, null, '素材已删除');
  })
);

router.post(
  '/materials/:id/download',
  asyncHandler(async (req, res) => ok(res, heritageService.downloadMaterial(req.params.id)))
);

/* ==================== 活动 ==================== */
router.get(
  '/events',
  optionalAuth,
  asyncHandler(async (req, res) => ok(res, heritageService.listEvents(req.user && req.user.id)))
);

router.post(
  '/events/:id/signup',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      realName: { required: true, type: 'string', min: 2, max: 20, label: '真实姓名' },
      phone: { required: true, type: 'phone', label: '手机号' },
      notes: { type: 'string', max: 200 },
    });
    return created(res, heritageService.signupEvent(req.user.id, req.params.id, body), '报名成功');
  })
);

router.get(
  '/my/signups',
  authenticateToken,
  asyncHandler(async (req, res) => ok(res, heritageService.mySignups(req.user.id)))
);

/* ==================== 资讯 ==================== */
router.get(
  '/news',
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { list, total } = heritageService.listNews({ limit, offset });
    const { paginate } = require('../utils/response');
    return paginate(res, { list, total, page, pageSize });
  })
);

/* ==================== 成就 ==================== */
router.get(
  '/achievements',
  optionalAuth,
  asyncHandler(async (req, res) => ok(res, heritageService.listAchievements(req.user && req.user.id)))
);

module.exports = router;
