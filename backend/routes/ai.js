// routes/ai.js —— AI 能力接口
const express = require('express');
const config = require('../config');
const { ok } = require('../utils/response');
const { validate } = require('../utils/validate');
const { asyncHandler } = require('../middleware/error');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { aiService } = require('../services/ai.service');

const router = express.Router();

// GET /api/ai/status —— 前端可先查 AI 是否可用，据此决定是否显示"AI 帮我写"按钮
router.get('/status', (req, res) =>
  ok(res, {
    ready: config.isAiReady(),
    model: config.qwenModel,
    provider: 'DashScope / 通义千问',
    note: config.isAiReady() ? '已配置，可调用大模型' : '未配置 QWEN_API_KEY，将使用规则兜底',
  })
);

// POST /api/ai/chat —— 非遗知识问答
router.post(
  '/chat',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      message: { required: true, type: 'string', min: 1, max: 300, label: '问题' },
      heritageId: { type: 'string', max: 64, label: '当前非遗项目' },
    });
    return ok(res, await aiService.chat(body));
  })
);

// POST /api/ai/work-desc —— 生成作品文案（挂在作品发布页）
router.post(
  '/work-desc',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      title: { required: true, type: 'string', min: 1, max: 60, label: '作品标题' },
      heritageId: { type: 'string', max: 64, label: '关联非遗项目' },
      keywords: { type: 'array', label: '关键词' },
      tone: { type: 'string', enum: ['文艺', '活泼', '专业'], label: '语言风格' },
    });
    return ok(res, await aiService.workDescription(body));
  })
);

// POST /api/ai/pattern-idea —— 纹样创意建议（挂在共创项目页）
router.post(
  '/pattern-idea',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      heritageId: { required: true, type: 'string', max: 64, label: '非遗项目' },
      medium: { type: 'string', max: 50, label: '目标载体' },
      audience: { type: 'string', max: 50, label: '目标人群' },
    });
    return ok(res, await aiService.patternIdea(body));
  })
);

// POST /api/ai/search-enhance —— 智能搜索扩展
router.post(
  '/search-enhance',
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      query: { required: true, type: 'string', min: 1, max: 50, label: '搜索词' },
    });
    return ok(res, aiService.searchEnhance(body.query));
  })
);

// GET /api/ai/recommend —— 个性化推荐（登录后基于行为，未登录按热度）
router.get(
  '/recommend',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 6, 20);
    return ok(res, aiService.recommend(req.user && req.user.id, { limit }));
  })
);

module.exports = router;
