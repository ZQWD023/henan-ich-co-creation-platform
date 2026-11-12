// middleware/error.js —— 全局异常处理 + 异步路由包装
const { AppError, CODE } = require('../utils/response');
const config = require('../config');

/** 把 async 路由的 reject 自动交给 next，避免每个路由都写 try/catch */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** 404：交给统一错误处理，保证响应体格式一致 */
function notFound(req, res, next) {
  next(AppError.notFound(`接口不存在：${req.method} ${req.originalUrl}`));
}

/** 兜底错误处理：必须放在所有路由之后，且必须是 4 个参数 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // 业务异常
  if (err instanceof AppError) {
    const body = { code: err.code, message: err.message, data: null };
    if (err.details) body.details = err.details;
    if (err.httpStatus >= 500) console.error('[业务异常]', err.message);
    return res.status(err.httpStatus).json(body);
  }

  // SQLite 约束冲突 → 转成人话，别把 SQL 报错甩给前端
  if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({
      code: CODE.CONFLICT,
      message: '数据已存在，请勿重复提交',
      data: null,
    });
  }
  if (err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    return res.status(400).json({
      code: CODE.PARAM_ERROR,
      message: '数据约束不满足（可能引用了不存在的记录）',
      data: null,
    });
  }

  // JSON 解析失败
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ code: CODE.PARAM_ERROR, message: '请求体不是合法 JSON', data: null });
  }

  console.error('[未捕获异常]', err);
  res.status(500).json({
    code: CODE.INTERNAL,
    message: config.nodeEnv === 'production' ? '服务器内部错误' : `服务器内部错误：${err.message}`,
    data: null,
  });
}

module.exports = { asyncHandler, notFound, errorHandler };
