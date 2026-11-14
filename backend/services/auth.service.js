// services/auth.service.js —— 注册 / 登录 / 改密 / 账号信息
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError, CODE } = require('../utils/response');
const { genId } = require('../utils/id');
const { userRepo, certRepo } = require('../repositories/user.repo');
const { interactionRepo } = require('../repositories/social.repo');
const { achievementRepo } = require('../repositories/heritage.repo');

const SALT_ROUNDS = 10;

/** 把用户名打码后再显示（用于"这个邮箱已注册过账号 12****78"这类提示） */
function maskName(name) {
  const s = String(name || '');
  if (s.length <= 1) return s;
  if (s.length <= 2) return s[0] + '*';
  if (s.length <= 4) return s[0] + '**' + s[s.length - 1];
  return s.slice(0, 2) + '****' + s.slice(-2);
}

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
  /**
   * 注册
   * 冲突时返回字段级信息（details.fields），前端据此高亮具体输入框并给出下一步建议，
   * 避免出现"不管怎么换都提示已被注册"的困惑（多数情况是邮箱重复）。
   */
  async register({ username, email, password }) {
    const name = String(username || '').trim();
    const mail = String(email || '').trim().toLowerCase();

    const byName = userRepo.findByUsername(name);
    const byEmail = userRepo.findByEmail(mail);

    if (byName || byEmail) {
      const fields = [];
      if (byName) fields.push('username');
      if (byEmail) fields.push('email');

      let message;
      if (byName && byEmail) {
        message = '这个用户名和邮箱都已被注册，请换一个用户名和邮箱，或直接登录已有账号';
      } else if (byEmail) {
        message = `这个邮箱已经注册过账号（${maskName(byEmail.username)}），每个邮箱只能注册一个账号。可以直接用这个邮箱登录，或换一个邮箱`;
      } else {
        message = '这个用户名已被注册，换一个用户名试试（邮箱不受影响）';
      }

      throw new AppError(CODE.CONFLICT, message, 409, {
        fields,
        existingUsername: byEmail ? maskName(byEmail.username) : null,
        suggestion: byName ? `${name}_${Math.floor(Math.random() * 900 + 100)}` : null,
      });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = userRepo.create({
      id: genId('user'),
      username: name,
      email: mail,
      password_hash: hash,
      display_name: name,
      avatar: null,
      bio: '',
      role: 'user',
      cert_status: 'none',
      joined_date: new Date().toISOString(),
    });

    // 新用户送一个"初识非遗"成就
    achievementRepo.unlock(user.id, 'first-visit');

    // 新账号自动铺一套可演示的共创数据（1 个自有项目 + 2 个参与项目 + 待审申请），
    // 这样任何人注册后进「我的工作台」不会是空白；失败不影响注册本身。
    try {
      require('./onboarding.service').seedUserWorkspace(user.id);
    } catch (e) {
      /* 演示数据失败不阻塞注册 */
    }

    return { token: signToken(user), user: publicUser(user) };
  },

  /** 用户名 / 邮箱是否可用（注册页实时校验，避免填完才被拒） */
  checkAvailability({ username, email }) {
    const name = String(username || '').trim();
    const mail = String(email || '').trim().toLowerCase();
    const byName = name ? userRepo.findByUsername(name) : null;
    const byEmail = mail ? userRepo.findByEmail(mail) : null;
    return {
      username: { value: name, taken: !!byName, suggestion: byName ? `${name}_${Math.floor(Math.random() * 900 + 100)}` : null },
      email: { value: mail, taken: !!byEmail, existingUsername: byEmail ? maskName(byEmail.username) : null },
    };
  },

  /**
   * 登录：支持「用户名」或「邮箱」
   * 之前只按用户名查，用户拿邮箱登录会一直得到"用户名或密码错误"。
   */
  async login({ username, password }) {
    const account = String(username || '').trim();
    let user = userRepo.findByUsername(account);
    if (!user && account.includes('@')) user = userRepo.findByEmail(account);

    // 账号不存在也做一次哈希比较，避免通过响应时间枚举账号
    const hash = user ? user.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
    const okPwd = await bcrypt.compare(String(password || ''), hash);

    if (!user || !okPwd) {
      throw new AppError(
        CODE.UNAUTHORIZED,
        '账号或密码错误。用户名和邮箱都可以登录，密码区分大小写',
        401,
        { hint: 'login-failed' }
      );
    }
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
