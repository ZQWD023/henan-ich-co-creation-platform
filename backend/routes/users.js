// routes/users.js —— 用户资料、关注、认证
const express = require('express');
const { ok, created } = require('../utils/response');
const { validate } = require('../utils/validate');
const { asyncHandler } = require('../middleware/error');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { userService } = require('../services/user.service');
const { interactionRepo } = require('../repositories/social.repo');
const { genId } = require('../utils/id');
const { AppError } = require('../utils/response');
const { notificationService } = require('../services/notification.service');

const router = express.Router();

// GET /api/users/me —— 已登录用户的完整资料（与 /auth/me 等价，保留兼容）
router.get(
  '/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { authService } = require('../services/auth.service');
    return ok(res, authService.me(req.user.id));
  })
);

// PUT /api/users/me —— 修改资料
router.put(
  '/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      displayName: { type: 'string', min: 1, max: 20, label: '昵称' },
      bio: { type: 'string', max: 200, label: '简介' },
      avatar: { type: 'string', max: 500, label: '头像地址' },
    });
    return ok(res, userService.updateProfile(req.user.id, body), '资料更新成功');
  })
);

// GET /api/users/me/favorites?type=project|work
router.get(
  '/me/favorites',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const type = req.query.type === 'work' ? 'work' : 'project';
    const rows = interactionRepo.myFavorites(req.user.id, type);
    const { db } = require('../db/database');
    const table = type === 'work' ? 'work' : 'co_project';
    const list = rows
      .map((r) => {
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(r.target_id);
        return row ? { ...row, favoritedAt: r.created_at, targetType: type } : null;
      })
      .filter(Boolean);
    return ok(res, list);
  })
);

/* ---------------- 传承人认证 ---------------- */
// POST /api/users/me/certification
router.post(
  '/me/certification',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      realName: { required: true, type: 'string', min: 2, max: 20, label: '真实姓名' },
      heritageId: { type: 'string', max: 64, label: '所属非遗项目' },
      level: { type: 'string', enum: ['国家级', '省级', '市级', '县级'], label: '传承级别' },
      title: { type: 'string', max: 50, label: '称号' },
      intro: { type: 'string', max: 500, label: '从艺经历' },
      materialUrl: { type: 'string', max: 500, label: '资质材料' },
    });
    return created(res, userService.applyCertification(req.user.id, body), '认证申请已提交，等待审核');
  })
);

router.get(
  '/me/certification',
  authenticateToken,
  asyncHandler(async (req, res) => ok(res, userService.myCertification(req.user.id)))
);

/* ---------------- 关注 ---------------- */
router.post(
  '/:userId/follow',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const targetId = req.params.userId;
    if (targetId === req.user.id) throw AppError.param('不能关注自己');
    const target = require('../repositories/user.repo').userRepo.findById(targetId);
    if (!target) throw AppError.notFound('用户不存在');

    const added = interactionRepo.add({
      id: genId('int'),
      userId: req.user.id,
      targetType: 'user',
      targetId,
      action: 'follow',
    });
    if (!added) throw AppError.conflict('已经关注过了');

    notificationService.push({
      userId: targetId,
      actorId: req.user.id,
      type: notificationService.TYPE.FOLLOW,
      title: `${req.user.display_name || req.user.username} 关注了你`,
      targetType: 'user',
      targetId: req.user.id,
    });
    return ok(res, { following: true }, '关注成功');
  })
);

router.delete(
  '/:userId/follow',
  authenticateToken,
  asyncHandler(async (req, res) => {
    interactionRepo.remove({
      userId: req.user.id,
      targetType: 'user',
      targetId: req.params.userId,
      action: 'follow',
    });
    return ok(res, { following: false }, '已取消关注');
  })
);

router.get(
  '/:userId/followers',
  asyncHandler(async (req, res) => ok(res, interactionRepo.followers(req.params.userId)))
);

router.get(
  '/:userId/following',
  asyncHandler(async (req, res) => ok(res, interactionRepo.followings(req.params.userId)))
);

// GET /api/users/:userId —— 公开资料（放最后，避免吃掉上面的静态路径）
router.get(
  '/:userId',
  optionalAuth,
  asyncHandler(async (req, res) =>
    ok(res, userService.getProfile(req.params.userId, req.user && req.user.id))
  )
);

module.exports = router;
