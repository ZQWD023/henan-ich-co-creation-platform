// services/user.service.js —— 用户资料 / 头像 / 传承人认证
const { AppError } = require('../utils/response');
const { genId } = require('../utils/id');
const { userRepo, certRepo } = require('../repositories/user.repo');
const { interactionRepo } = require('../repositories/social.repo');
const { notificationService } = require('./notification.service');
const { publicUser } = require('./auth.service');

const userService = {
  getProfile(userId, viewerId) {
    const u = userRepo.findById(userId);
    if (!u) throw AppError.notFound('用户不存在');

    const { db } = require('../db/database');
    const works = db
      .prepare(
        `SELECT id, title, work_type, cover_url, likes_count, views_count, created_at
         FROM work WHERE user_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 12`
      )
      .all(userId);

    return {
      ...publicUser(u),
      bio: u.bio,
      works,
      stats: {
        works: db.prepare("SELECT COUNT(*) AS n FROM work WHERE user_id = ? AND status = 'approved'").get(userId).n,
        projects: db.prepare('SELECT COUNT(*) AS n FROM co_project WHERE owner_id = ?').get(userId).n,
        following: interactionRepo.followingCount(userId),
        followers: interactionRepo.followerCount(userId),
      },
      isFollowing: viewerId
        ? interactionRepo.exists({ userId: viewerId, targetType: 'user', targetId: userId, action: 'follow' })
        : false,
      isSelf: viewerId === userId,
    };
  },

  updateProfile(userId, { displayName, bio, avatar }) {
    const patch = {};
    if (displayName !== undefined) patch.display_name = displayName;
    if (bio !== undefined) patch.bio = bio;
    if (avatar !== undefined) patch.avatar = avatar;
    const u = userRepo.updateProfile(userId, patch);
    return publicUser(u);
  },

  /* ---------- 传承人认证 ---------- */
  applyCertification(userId, body) {
    const pending = certRepo.latestByUser(userId);
    if (pending && pending.status === 'pending') {
      throw AppError.conflict('已有待审核的认证申请，请等待审核结果');
    }

    const row = {
      id: genId('cert'),
      user_id: userId,
      real_name: body.realName,
      heritage_id: body.heritageId || null,
      level: body.level || null,
      title: body.title || null,
      intro: body.intro || null,
      material_url: body.materialUrl || null,
    };
    const cert = certRepo.create(row);
    userRepo.updateProfile(userId, { cert_status: 'pending' });
    return cert;
  },

  myCertification(userId) {
    return certRepo.latestByUser(userId) || null;
  },

  /** 管理员审核：通过则同时把用户角色升级为 creator */
  reviewCertification(certId, { status, note, reviewerId }) {
    const cert = certRepo.findById(certId);
    if (!cert) throw AppError.notFound('认证申请不存在');
    if (cert.status !== 'pending') throw AppError.conflict('该申请已处理过');

    const updated = certRepo.review(certId, { status, note, reviewerId });

    if (status === 'approved') {
      userRepo.updateProfile(cert.user_id, { cert_status: 'approved', role: 'creator' });
    } else {
      userRepo.updateProfile(cert.user_id, { cert_status: 'rejected' });
    }

    notificationService.push({
      userId: cert.user_id,
      actorId: reviewerId,
      type: notificationService.TYPE.AUDIT,
      title: status === 'approved' ? '传承人认证已通过' : '传承人认证未通过',
      content: note || (status === 'approved' ? '恭喜！你现在可以发布官方作品与发起共创项目了。' : '请补充材料后重新提交。'),
      targetType: 'certification',
      targetId: certId,
    });

    return updated;
  },

  listPendingCertifications({ limit, offset }) {
    return certRepo.listPending({ limit, offset });
  },
};

module.exports = { userService };
