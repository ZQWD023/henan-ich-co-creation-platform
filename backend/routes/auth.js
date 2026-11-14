// routes/auth.js —— 认证路由
const express = require('express');
const { ok, created } = require('../utils/response');
const { validate } = require('../utils/validate');
const { asyncHandler } = require('../middleware/error');
const { authenticateToken } = require('../middleware/auth');
const { authService } = require('../services/auth.service');

const router = express.Router();

// GET /api/auth/check?username=&email= —— 注册页实时校验用户名/邮箱是否可用
router.get(
  '/check',
  asyncHandler(async (req, res) =>
    ok(
      res,
      authService.checkAvailability({
        username: req.query.username,
        email: req.query.email,
      })
    )
  )
);

// POST /api/auth/register
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      username: { required: true, type: 'string', min: 3, max: 20, label: '用户名' },
      email: { required: true, type: 'email', label: '邮箱' },
      password: { required: true, type: 'string', min: 6, max: 64, label: '密码' },
    });
    const result = await authService.register(body);
    return created(res, result, '注册成功');
  })
);

// POST /api/auth/login —— 用户名或邮箱都可以
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      username: { required: true, type: 'string', label: '用户名或邮箱' },
      password: { required: true, type: 'string', label: '密码' },
    });
    return ok(res, await authService.login(body), '登录成功');
  })
);

// GET /api/auth/me
router.get(
  '/me',
  authenticateToken,
  asyncHandler(async (req, res) => ok(res, authService.me(req.user.id)))
);

// PUT /api/auth/password —— 修改密码（替代原来的 localStorage 明文逻辑）
router.put(
  '/password',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      oldPassword: { required: true, type: 'string', label: '当前密码' },
      newPassword: { required: true, type: 'string', min: 6, max: 64, label: '新密码' },
    });
    await authService.changePassword(req.user.id, body);
    return ok(res, null, '密码修改成功');
  })
);

// POST /api/auth/forgot-password —— 申请重置令牌
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      username: { required: true, type: 'string', label: '用户名' },
      email: { required: true, type: 'email', label: '邮箱' },
    });
    return ok(res, authService.requestReset(body), '验证通过，请使用 resetToken 重置密码');
  })
);

// POST /api/auth/reset-password —— 用令牌重置
router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      resetToken: { required: true, type: 'string', label: '重置令牌' },
      newPassword: { required: true, type: 'string', min: 6, max: 64, label: '新密码' },
    });
    await authService.resetPassword(body);
    return ok(res, null, '密码已重置，请重新登录');
  })
);

// DELETE /api/auth/account —— 注销账号（需密码确认）
router.delete(
  '/account',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, { password: { required: true, type: 'string', label: '密码' } });
    await authService.deleteAccount(req.user.id, body.password);
    return ok(res, null, '账号已注销');
  })
);

module.exports = router;
