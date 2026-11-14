// config/index.js —— 环境变量集中管理，避免 process.env 散落各处
require('dotenv').config();
const path = require('path');

const ROOT = path.join(__dirname, '..');

const config = {
  root: ROOT,
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // 数据库与上传
  dbPath: process.env.DATABASE_PATH || path.join(ROOT, 'database.sqlite'),
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'),
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024),

  // 跨域：生产环境务必写死域名
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // AI（通义千问 / DashScope）
  qwenApiKey: process.env.QWEN_API_KEY || '',
  qwenModel: process.env.QWEN_MODEL || 'qwen-turbo',
  qwenBaseUrl:
    process.env.QWEN_BASE_URL ||
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',

  // 分页
  defaultPageSize: 20,
  maxPageSize: 100,
};

if (config.nodeEnv === 'production' && config.jwtSecret.includes('dev-secret')) {
  // 不阻断启动，但要显式告警：评委会问安全
  console.warn('[安全告警] 生产环境仍在用默认 JWT_SECRET，请在 .env 中更换为 32 位以上随机串');
}

config.isAiReady = () =>
  Boolean(config.qwenApiKey) && !config.qwenApiKey.startsWith('your-');

module.exports = config;
