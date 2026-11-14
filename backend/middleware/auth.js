// middleware/auth.js —— 认证 + 角色鉴权
// 三层：required（必须登录）/ optional（有 token 就解析）/ requireRole（角色白名单）
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db/database');
const { AppError } = require('../utils/response');

const ROLE_LEVEL = { user: 1, creator: 2, admin: 3 };

function readToken(req) {
  const header = req.headers['authorization'] || req.headers['Authorization'];
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.query && req.query.token) return String(req.query.token); // 供 <img>/下载等无法带 header 的场景
  return null;
}

function loadUser(userId) {
  return db
    .prepare('SELECT id, username, display_name, avatar, role, cert_status, status FROM users WHERE id = ?')
    .get(userId);
}

/** 必须登录 */
function authenticateToken(req, res, next) {
  const token = readToken(req);
  if (!token) return next(AppError.unauthorized('未提供认证令牌'));

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new (require('../utils/response').AppError)(40101, '登录已过期，请重新登录', 401));
    }
    return next(AppError.forbidden('令牌无效'));
  }

  const user = loadUser(payload.userId);
  if (!user) return next(AppError.unauthorized('账号不存在'));
  if (user.status === 'banned') return next(AppError.forbidden('账号已被封禁'));

  req.user = user; // 每次从库里取最新角色，避免 token 里的旧角色越权
  next();
}

/** 可选登录：没 token 也能过，用于"已点赞/已收藏"这类个性化字段 */
function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = loadUser(payload.userId);
    if (user && user.status !== 'banned') req.user = user;
  } catch {
    /* 忽略无效 token */
  }
  next();
}

/** 角色鉴权：requireRole('admin') 或 requireRole('creator','admin') */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        AppError.forbidden(`需要 ${roles.join(' 或 ')} 权限，当前角色为 ${req.user.role}`)
      );
    }
    next();
  };
}

/** 已认证传承人（发布官方作品用） */
function requireCertified(req, res, next) {
  if (!req.user) return next(AppError.unauthorized());
  if (req.user.role === 'admin') return next();
  if (req.user.cert_status !== 'approved' && req.user.role !== 'creator') {
    return next(AppError.forbidden('请先完成传承人认证'));
  }
  next();
}

/** 是否为资源所有者（在 service 里更细的校验由业务层做，这里是通用兜底） */
function isSelfOrAdmin(req, userId) {
  return Boolean(req.user) && (req.user.id === userId || req.user.role === 'admin');
}

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireCertified,
  isSelfOrAdmin,
  ROLE_LEVEL,
  readToken,
};
