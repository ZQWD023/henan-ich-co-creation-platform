// routes/community.js —— 社区互动：评论 / 通用点赞收藏 / 话题 / 通知
// 挂载在 /api 下，对外路径为 /api/comments、/api/interactions、/api/topics、/api/notifications
const express = require('express');
const { ok, created, paginate } = require('../utils/response');
const { validate } = require('../utils/validate');
const { parsePage } = require('../utils/pagination');
const { asyncHandler } = require('../middleware/error');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { socialService, TARGET_TYPES } = require('../services/social.service');
const { notificationService } = require('../services/notification.service');

const router = express.Router();

/* ==================== 评论 ==================== */
// GET /api/comments?targetType=work&targetId=xxx
router.get(
  '/comments',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const targetType = req.query.targetType;
    const targetId = req.query.targetId;
    if (!targetType || !targetId) {
      return res.status(400).json({ code: 40000, message: '需要 targetType 与 targetId', data: null });
    }
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { list, total } = socialService.listComments({ targetType, targetId, limit, offset }, req.user);
    return paginate(res, { list, total, page, pageSize });
  })
);

// POST /api/comments
router.post(
  '/comments',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      targetType: { required: true, type: 'string', enum: TARGET_TYPES, label: '目标类型' },
      targetId: { required: true, type: 'string', max: 64, label: '目标 ID' },
      content: { required: true, type: 'string', min: 1, max: 1000, label: '评论内容' },
      parentId: { type: 'string', max: 64, label: '父评论 ID' },
    });
    return created(res, socialService.createComment(req.user, body), '评论成功');
  })
);

// DELETE /api/comments/:id
router.delete(
  '/comments/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    socialService.deleteComment(req.params.id, req.user);
    return ok(res, null, '评论已删除');
  })
);

/* ==================== 通用点赞 / 收藏 ==================== */
// POST /api/interactions/toggle  { targetType, targetId, action }
router.post(
  '/interactions/toggle',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      targetType: { required: true, type: 'string', enum: TARGET_TYPES, label: '目标类型' },
      targetId: { required: true, type: 'string', max: 64, label: '目标 ID' },
      action: { required: true, type: 'string', enum: ['like', 'favorite'], label: '动作' },
    });
    const result = socialService.toggleInteraction(req.user, body);
    return ok(res, result, result.active ? '操作成功' : '已取消');
  })
);

// GET /api/interactions/mine?targetType=work&action=like
router.get(
  '/interactions/mine',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const targetType = req.query.targetType || 'work';
    const action = req.query.action || 'like';
    return ok(res, socialService.myInteractionIds(req.user, { targetType, action }));
  })
);

/* ==================== 话题 ==================== */
router.get(
  '/topics',
  asyncHandler(async (req, res) => ok(res, socialService.listTopics()))
);

router.post(
  '/topics',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      name: { required: true, type: 'string', min: 2, max: 30, label: '话题名' },
      description: { type: 'string', max: 200, label: '话题说明' },
    });
    return created(res, socialService.createTopic(req.user, body), '话题已创建');
  })
);

router.get(
  '/topics/:name/works',
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const { topic, list, total } = socialService.topicWorks(req.params.name, { limit, offset });
    return paginate(res, { list, total, page, pageSize, topic });
  })
);

/* ==================== 通知 ==================== */
router.get(
  '/notifications',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { page, pageSize, limit, offset } = parsePage(req.query);
    const onlyUnread = req.query.unread === '1' || req.query.unread === 'true';
    const { list, total } = notificationService.list(req.user.id, { onlyUnread, limit, offset });
    return paginate(res, { list, total, page, pageSize });
  })
);

router.get(
  '/notifications/unread-count',
  authenticateToken,
  asyncHandler(async (req, res) => ok(res, { count: notificationService.unreadCount(req.user.id) }))
);

router.patch(
  '/notifications/:id/read',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const okRead = notificationService.markRead(req.params.id, req.user.id);
    return ok(res, { updated: okRead }, okRead ? '已读' : '通知不存在');
  })
);

router.patch(
  '/notifications/read-all',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const n = notificationService.markAllRead(req.user.id);
    return ok(res, { updated: n }, `已标记 ${n} 条为已读`);
  })
);

module.exports = router;
