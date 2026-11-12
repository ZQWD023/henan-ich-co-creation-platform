// utils/response.js —— 统一响应体 + 业务异常
// 所有接口统一返回 { code, message, data }
// code = 0 表示成功；非 0 为业务错误码（与 HTTP 状态码并行，前端只看 code 也能判断）

const CODE = {
  OK: 0,
  PARAM_ERROR: 40000,
  VALIDATION_ERROR: 40001,
  UNAUTHORIZED: 40100,
  TOKEN_EXPIRED: 40101,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  CONFLICT: 40900,
  INTERNAL: 50000,
  AI_ERROR: 50200,
};

class AppError extends Error {
  /**
   * @param {number} code 业务错误码
   * @param {string} message 面向用户的提示
   * @param {number} httpStatus HTTP 状态码
   * @param {any} details 可选细节（校验失败时给字段级信息）
   */
  constructor(code, message, httpStatus = 400, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.expose = true;
  }

  static param(message = '参数错误', details) {
    return new AppError(CODE.PARAM_ERROR, message, 400, details);
  }
  static validation(message = '参数校验失败', details) {
    return new AppError(CODE.VALIDATION_ERROR, message, 400, details);
  }
  static unauthorized(message = '请先登录') {
    return new AppError(CODE.UNAUTHORIZED, message, 401);
  }
  static forbidden(message = '没有操作权限') {
    return new AppError(CODE.FORBIDDEN, message, 403);
  }
  static notFound(message = '资源不存在') {
    return new AppError(CODE.NOT_FOUND, message, 404);
  }
  static conflict(message = '状态冲突，操作不被允许') {
    return new AppError(CODE.CONFLICT, message, 409);
  }
  static internal(message = '服务器内部错误') {
    return new AppError(CODE.INTERNAL, message, 500);
  }
}

/** 成功响应 */
function ok(res, data = null, message = 'ok') {
  return res.status(200).json({ code: CODE.OK, message, data });
}

/** 创建成功 */
function created(res, data = null, message = '创建成功') {
  return res.status(201).json({ code: CODE.OK, message, data });
}

/** 分页响应，前端拿 data.list / data.total 即可 */
function paginate(res, { list, total, page, pageSize }) {
  return res.status(200).json({
    code: CODE.OK,
    message: 'ok',
    data: {
      list,
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    },
  });
}

module.exports = { CODE, AppError, ok, created, paginate };
