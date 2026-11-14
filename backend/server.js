// server.js —— 应用装配入口
// 分层：routes（控制器）→ services（业务）→ repositories（SQL）→ db
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const config = require('./config');
const { initDatabase } = require('./db/database');
const { runBootstrap } = require('./db/bootstrap');
const { notFound, errorHandler } = require('./middleware/error');
const { ok } = require('./utils/response');

const app = express();

// 前端站点目录（后端同时提供网页与 API，浏览器一律同源请求，不会再出现"连不上后端"）
const SITE_DIR = path.join(__dirname, '..', '算法网站(3)');
const HOME_URL = `http://localhost:${config.port}/`;

/** 启动后自动打开浏览器（AUTO_OPEN_BROWSER=0 可关闭） */
function openBrowser(url) {
  if (String(process.env.AUTO_OPEN_BROWSER || '1') === '0') return;
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (e) {
    /* 打不开浏览器不影响服务 */
  }
}

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
// 注册页的"用户名/邮箱可用性校验"是 GET /check，不算尝试次数，跳过计数
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET' && req.path.replace(/\/+$/, '') === '/check',
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
app.use('/api/mcp', require('./routes/mcp')); // MCP 风格的工具端点（JSON-RPC 2.0）
app.use('/api/upload', require('./routes/upload'));

/* ---------------- 元信息 ---------------- */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => res.redirect('/index.html'));

// 接口自述（保留原来首页那份说明，改挂到 /api-info）
app.get('/api-info', (req, res) =>
  ok(res, {
    name: '河南省非遗共创平台 API',
    version: '2.0.0',
    env: config.nodeEnv,
    docs: '/api-docs',
    site: '/index.html',
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
// 缓存策略（对应评分「前端性能优化」）：
//   · HTML 不缓存，改了就能看到
//   · 带 ?v= 的 js/css 是版本化资源 → 一年强缓存 + immutable
//   · 图片字体 → 1 天缓存
app.use((req, res, next) => {
  const isProd = config.nodeEnv === 'production';
  if (/\.(?:js|css)$/i.test(req.path) && /[?&]v=/.test(req.url)) {
    // 开发环境不缓存，避免改了代码看不到效果；生产环境版本化资源强缓存
    res.setHeader(
      'Cache-Control',
      isProd ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate'
    );
  } else if (/\.(?:jpg|jpeg|png|webp|gif|svg|ico|woff2?)$/i.test(req.path)) {
    res.setHeader('Cache-Control', isProd ? 'public, max-age=86400' : 'public, max-age=0, must-revalidate');
  }
  next();
});

app.use(
  express.static(SITE_DIR, {
    index: 'index.html',
    extensions: ['html'],
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (/\.html?$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

/* ---------------- 错误处理（必须最后） ---------------- */
app.use(notFound);
app.use(errorHandler);

/* ---------------- 启动 ---------------- */
function bootstrap() {
  initDatabase();

  // 首次运行自动灌数据：非遗内容 + 共创演示项目（可用 AUTO_SETUP=0 关闭）
  try {
    runBootstrap();
  } catch (e) {
    console.warn('[自动初始化] 跳过：', e.message);
  }

  const server = app.listen(config.port, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║   河南省非遗共创平台 · 后端 API  v2.0.0          ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log(`  网站首页   ${HOME_URL}`);
    console.log(`  接口文档   ${HOME_URL}api-docs`);
    console.log(`  健康检查   ${HOME_URL}health`);
    console.log(`  运行环境   ${config.nodeEnv}`);
    console.log(`  数据库     ${config.dbPath}`);
    console.log(`  AI 状态    ${config.isAiReady() ? '已配置（通义千问 ' + config.qwenModel + '）' : '未配置，走本地规则兜底'}`);
    console.log('  关闭服务   按 Ctrl+C 或直接关闭本窗口');
    console.log('');
    openBrowser(HOME_URL);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // 端口已被占用：说明服务已经在跑了，直接打开浏览器即可（双击第二次不会报错）
      console.log('');
      console.log(`  [提示] ${config.port} 端口上已经有服务在运行，直接把网页打开。`);
      console.log(`  网站首页   ${HOME_URL}`);
      console.log('');
      openBrowser(HOME_URL);
      setTimeout(() => process.exit(0), 800);
      return;
    }
    console.error('[启动失败]', err);
    process.exit(1);
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

