// services/auth.service.js —— 注册 / 登录 / 改密 / 账号信息
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('../utils/response');
const { genId } = require('../utils/id');
const { userRepo, certRepo } = require('../repositories/user.repo');
const { interactionRepo } = require('../repositories/social.repo');
const { achievementRepo } = require('../repositories/heritage.repo');

const SALT_ROUNDS = 10;

function signToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/** 对外输出用户信息（绝不包含 password_hash） */
function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.display_name || u.username,
    avatar: u.avatar,
    bio: u.bio,
    role: u.role,
    certStatus: u.cert_status,
    status: u.status,
    joinedDate: u.joined_date,
    lastLoginAt: u.last_login_at,
    createdAt: u.created_at,
  };
}

const authService = {
  async register({ username, email, password }) {
    const exist = userRepo.findByUsernameOrEmail(username, email);
    if (exist) {
      throw AppError.conflict(exist.username === username ? '用户名已被注册' : '邮箱已被注册');
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = userRepo.create({
      id: genId('user'),
      username,
      email,
      password_hash: hash,
      display_name: username,
      avatar: null,
      bio: '',
      role: 'user',
      cert_status: 'none',
      joined_date: new Date().toISOString(),
    });

    // 新用户送一个"初识非遗"成就
    achievementRepo.unlock(user.id, 'first-visit');

    return { token: signToken(user), user: publicUser(user) };
  },

  async login({ username, password }) {
    const user = userRepo.findByUsername(username);
    // 用户名不存在也做一次哈希比较，避免通过响应时间枚举用户名
    const hash = user ? user.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
    const okPwd = await bcrypt.compare(password, hash);

    if (!user || !okPwd) throw new AppError(40100, '用户名或密码错误', 401);
    if (user.status === 'banned') throw AppError.forbidden('账号已被封禁，请联系管理员');

    userRepo.touchLogin(user.id);
    return { token: signToken(user), user: publicUser(user) };
  },

  /** 当前用户完整信息（含收藏/点赞/投稿/成就），供"我的"页面一次拉全 */
  me(userId) {
    const user = userRepo.findById(userId);
    if (!user) throw AppError.notFound('用户不存在');

    return {
      ...publicUser(user),
      certification: certRepo.latestByUser(userId) || null,
      stats: {
        works: require('../db/database').db
          .prepare("SELECT COUNT(*) AS n FROM work WHERE user_id = ? AND status = 'approved'")
          .get(userId).n,
        projects: require('../db/database').db
          .prepare('SELECT COUNT(*) AS n FROM co_project WHERE owner_id = ?')
          .get(userId).n,
        joinedProjects: require('../db/database').db
          .prepare("SELECT COUNT(*) AS n FROM co_member WHERE user_id = ? AND status = 'approved'")
          .get(userId).n,
        favorites: interactionRepo.myTargetIds(userId, 'project', 'favorite').length,
        likes: interactionRepo.myTargetIds(userId, 'work', 'like').length,
        following: interactionRepo.followingCount(userId),
        followers: interactionRepo.followerCount(userId),
      },
      achievements: achievementRepo.listByUser(userId),
    };
  },

  /** 修改密码：必须校验旧密码 —— 这是原来前端 localStorage 明文逻辑的正解 */
  async changePassword(userId, { oldPassword, newPassword }) {
    const user = userRepo.findById(userId);
    if (!user) throw AppError.notFound('用户不存在');

    const okPwd = await bcrypt.compare(oldPassword, user.password_hash);
    if (!okPwd) throw AppError.param('当前密码不正确');
    if (oldPassword === newPassword) throw AppError.param('新密码不能与旧密码相同');

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    userRepo.updatePassword(userId, hash);
    return true;
  },

  /**
   * 找回密码（简化实现）：校验用户名 + 邮箱是否匹配，返回一次性重置令牌。
   * 真上线时把 token 通过邮件发出，这里返回给前端仅用于演示。
   */
  requestReset({ username, email }) {
    const user = userRepo.findByUsername(username);
    if (!user || (user.email || '').toLowerCase() !== email.toLowerCase()) {
      throw AppError.param('用户名与邮箱不匹配');
    }
    const resetToken = jwt.sign({ userId: user.id, purpose: 'reset' }, config.jwtSecret, { expiresIn: '15m' });
    return { resetToken, expiresIn: 900 };
  },

  async resetPassword({ resetToken, newPassword }) {
    let payload;
    try {
      payload = jwt.verify(resetToken, config.jwtSecret);
    } catch {
      throw AppError.param('重置链接无效或已过期');
    }
    if (payload.purpose !== 'reset') throw AppError.param('重置令牌无效');

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    userRepo.updatePassword(payload.userId, hash);
    return true;
  },

  /** 注销账号：连带清理个人数据（外键 CASCADE 已处理大部分） */
  async deleteAccount(userId, password) {
    const user = userRepo.findById(userId);
    if (!user) throw AppError.notFound('用户不存在');
    if (user.role === 'admin') throw AppError.forbidden('管理员账号不能自行注销');
    const okPwd = await bcrypt.compare(password, user.password_hash);
    if (!okPwd) throw AppError.param('密码不正确');
    userRepo.remove(userId);
    return true;
  },
};

module.exports = { authService, publicUser, signToken };
