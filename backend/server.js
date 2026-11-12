// server.js —— 应用装配入口
// 分层：routes（控制器）→ services（业务）→ repositories（SQL）→ db
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const { initDatabase } = require('./db/database');
const { notFound, errorHandler } = require('./middleware/error');
const { ok } = require('./utils/response');

const app = express();

/* ---------------- 基础中间件 ---------------- */
app.set('trust proxy', 1); // 部署在 Nginx 反代后，限流才能取到真实 IP

app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
    credentials: true,
  })
);

// base64 上传需要更大的 body 上限
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// 全局限流：15 分钟 600 次（演示够用，也能挡住暴力破解）
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 600),
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 42900, message: '请求过于频繁，请稍后再试', data: null },
  })
);

// 登录/注册单独限流，防撞库
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 42900, message: '尝试次数过多，请 15 分钟后再试', data: null },
});

// 静态资源：上传的文件
if (!fs.existsSync(config.uploadDir)) fs.mkdirSync(config.uploadDir, { recursive: true });
app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d' }));

// 简易请求日志（生产可换 morgan/pino）
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.originalUrl !== '/health') {
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

/* ---------------- 路由挂载 ---------------- */
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/content', require('./routes/heritage'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/works', require('./routes/works'));
app.use('/api', require('./routes/community')); // /api/comments /api/interactions /api/topics /api/notifications
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/upload', require('./routes/upload'));

/* ---------------- 元信息 ---------------- */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get('/', (req, res) =>
  ok(res, {
    name: '河南省非遗共创平台 API',
    version: '2.0.0',
    env: config.nodeEnv,
    docs: '/api-docs',
    modules: [
      '/api/auth 认证',
      '/api/users 用户与认证审核',
      '/api/content 非遗内容库（分类/项目/传承人/素材/活动/资讯）',
      '/api/projects 共创协作（核心）',
      '/api/works 作品',
      '/api/comments 评论 · /api/interactions 点赞收藏 · /api/topics 话题 · /api/notifications 通知',
      '/api/admin 管理后台',
      '/api/ai AI 能力',
      '/api/upload 文件上传',
    ],
  })
);

// 接口文档（零依赖：CDN 加载 Swagger UI，读取同目录 openapi.json）
app.get('/api-docs', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'api.html')));
app.get('/api-docs/openapi.json', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'openapi.json')));

// 同一服务提供网页和 API，浏览器可以直接使用同源请求。
app.use(express.static(path.join(__dirname, '..', '算法网站(3)'), { index: false }));

/* ---------------- 错误处理（必须最后） ---------------- */
app.use(notFound);
app.use(errorHandler);

/* ---------------- 启动 ---------------- */
function bootstrap() {
  initDatabase();
  const server = app.listen(config.port, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║   河南省非遗共创平台 · 后端 API  v2.0.0          ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log(`  服务地址   http://localhost:${config.port}`);
    console.log(`  接口文档   http://localhost:${config.port}/api-docs`);
    console.log(`  健康检查   http://localhost:${config.port}/health`);
    console.log(`  运行环境   ${config.nodeEnv}`);
    console.log(`  数据库     ${config.dbPath}`);
    console.log(`  AI 状态    ${config.isAiReady() ? '已配置（通义千问 ' + config.qwenModel + '）' : '未配置，走规则兜底'}`);
    console.log('');
  });

  const shutdown = (sig) => {
    console.log(`\n收到 ${sig}，正在关闭服务...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (r) => console.error('[未处理的 Promise 拒绝]', r));
  process.on('uncaughtException', (e) => {
    console.error('[未捕获异常]', e);
  });

  return server;
}

if (require.main === module) bootstrap();

module.exports = { app, bootstrap };
