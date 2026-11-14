// routes/ai.js —— AI 能力接口
const express = require('express');
const config = require('../config');
const { ok } = require('../utils/response');
const { validate } = require('../utils/validate');
const { asyncHandler } = require('../middleware/error');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { aiService } = require('../services/ai.service');
const agentService = require('../services/agent.service');

const router = express.Router();

/** SSE 响应头（关闭缓冲，逐条推送事件） */
function openSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  return (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// GET /api/ai/tools —— Agent 的工具清单（Function Calling / MCP 风格的 schema）
router.get('/tools', (req, res) =>
  ok(res, {
    protocol: 'function-calling',
    note: '这 5 个工具由 /api/ai/agent 实际调用，前端会把调用轨迹可视化',
    tools: agentService.TOOLS,
  })
);

// POST /api/ai/chat/stream —— 流式问答（SSE）
// 事件：thought 思考 | retrieval 检索结果 | delta 增量文本 | notice AI 标识 | done 结束 | blocked 拦截 | error
router.post('/chat/stream', optionalAuth, (req, res) => {
  const message = String((req.body && req.body.message) || '').slice(0, 300).trim();
  const heritageId = req.body && req.body.heritageId ? String(req.body.heritageId).slice(0, 64) : undefined;

  if (!message) {
    return res.status(400).json({ code: 40001, message: '问题不能为空', data: null });
  }

  const send = openSSE(res);
  let closed = false;
  req.on('close', () => { closed = true; });

  (async () => {
    try {
      for await (const event of aiService.chatStream({ message, heritageId })) {
        if (closed) break;
        send(event);
      }
    } catch (err) {
      send({ type: 'error', message: '回答生成中断，请重试一次' });
    } finally {
      if (!closed) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  })();
});

// POST /api/ai/agent/stream —— AI 共创 Agent：边执行工具边把步骤推给前端
router.post('/agent/stream', optionalAuth, (req, res) => {
  const goal = String((req.body && req.body.goal) || '').slice(0, 200).trim();
  const heritageId = req.body && req.body.heritageId ? String(req.body.heritageId).slice(0, 64) : undefined;

  if (!goal) {
    return res.status(400).json({ code: 40001, message: '请描述你的共创目标', data: null });
  }

  const send = openSSE(res);
  let closed = false;
  req.on('close', () => { closed = true; });

  (async () => {
    try {
      send({ type: 'start', goal, toolCount: agentService.TOOLS.length });
      const result = await agentService.run(goal, {
        heritageId,
        onStep: async (step) => {
          if (!closed) send({ type: 'step', step });
        },
      });
      if (!closed) {
        send({ type: 'result', result });
        send({ type: 'done' });
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch (err) {
      if (!closed) {
        send({ type: 'error', message: 'Agent 执行失败：' + err.message });
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  })();
});

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
