// services/work.service.js —— 作品业务层（发布 / 编辑 / 上下架 / 点赞 / 收藏 / 审核）
const { AppError } = require('../utils/response');
const { genId } = require('../utils/id');
const { workRepo } = require('../repositories/work.repo');
const { interactionRepo, topicRepo } = require('../repositories/social.repo');
const { notificationService } = require('./notification.service');

function parseTags(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
}

function mapWork(row, { userId } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    workType: row.work_type,
    summary: row.summary,
    content: row.content,
    coverUrl: row.cover_url,
    fileUrl: row.file_url,
    tags: parseTags(row.tags),
    status: row.status,
    auditNote: row.audit_note,
    viewsCount: row.views_count,
    likesCount: row.likes_count,
    favoritesCount: row.favorites_count,
    commentsCount: row.comments_count,
    heritageId: row.heritage_id,
    heritageName: row.heritage_name || null,
    projectId: row.project_id,
    projectTitle: row.project_title || null,
    author: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatar: row.avatar,
      role: row.author_role,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // 个性化状态
    liked: userId
      ? interactionRepo.exists({ userId, targetType: 'work', targetId: row.id, action: 'like' })
      : false,
    favorited: userId
      ? interactionRepo.exists({ userId, targetType: 'work', targetId: row.id, action: 'favorite' })
      : false,
  };
}

const workService = {
  list(query, user) {
    const sortMap = {
      newest: 'w.created_at DESC',
      hot: 'w.likes_count DESC, w.views_count DESC',
      views: 'w.views_count DESC',
    };
    // 普通用户只能看 approved；看自己的作品要显式传 mine
    const status = query.mine && user ? undefined : query.status || 'approved';

    const { list, total } = workRepo.search({
      status: query.mine && user ? undefined : status,
      userId: query.mine && user ? user.id : query.userId,
      heritageId: query.heritageId,
      projectId: query.projectId,
      workType: query.workType,
      keyword: query.keyword,
      sortBy: sortMap[query.sort] || sortMap.newest,
      limit: query.limit,
      offset: query.offset,
    });
    return { list: list.map((r) => mapWork(r, { userId: user && user.id })), total };
  },

  detail(id, user) {
    const row = workRepo.findById(id);
    if (!row) throw AppError.notFound('作品不存在');

    const isOwner = user && row.user_id === user.id;
    const isAdmin = user && user.role === 'admin';
    if (row.status !== 'approved' && !isOwner && !isAdmin) {
      throw AppError.notFound('作品不存在或未通过审核');
    }

    workRepo.incViews(id);
    return mapWork(row, { userId: user && user.id });
  },

  create(user, body) {
    // 已认证传承人发布的作品直接通过审核，普通用户需管理员审核
    const autoApprove = user.role === 'creator' || user.role === 'admin';

    const row = {
      id: genId('work'),
      user_id: user.id,
      heritage_id: body.heritageId || null,
      project_id: body.projectId || null,
      title: body.title,
      work_type: body.workType || null,
      summary: body.summary || null,
      content: body.content || null,
      cover_url: body.coverUrl || null,
      file_url: body.fileUrl || null,
      tags: JSON.stringify(body.tags || []),
      status: autoApprove ? 'approved' : 'pending',
    };
    const w = workRepo.create(row);

    // 话题绑定
    (body.topics || []).forEach((name) => {
      let t = topicRepo.findByName(name);
      if (!t) t = topicRepo.create({ id: genId('topic'), name, description: null });
      topicRepo.bindWork(w.id, t.id);
      topicRepo.refreshCount(t.id);
    });

    return mapWork(w, { userId: user.id });
  },

  update(id, user, body) {
    const row = workRepo.findById(id);
    if (!row) throw AppError.notFound('作品不存在');
    if (row.user_id !== user.id && user.role !== 'admin') throw AppError.forbidden('只能编辑自己的作品');

    const patch = {};
    ['title', 'workType', 'summary', 'content', 'coverUrl', 'fileUrl', 'heritageId'].forEach((k) => {
      if (body[k] !== undefined) {
        const map = {
          title: 'title',
          workType: 'work_type',
          summary: 'summary',
          content: 'content',
          coverUrl: 'cover_url',
          fileUrl: 'file_url',
          heritageId: 'heritage_id',
        };
        patch[map[k]] = body[k];
      }
    });
    if (body.tags !== undefined) patch.tags = JSON.stringify(body.tags);
    // 编辑后重新进入待审核（管理员与传承人除外）
    if (user.role === 'user') patch.status = 'pending';

    workRepo.update(id, patch);
    return mapWork(workRepo.findById(id), { userId: user.id });
  },

  /** 上/下架：作者或管理员 */
  setStatus(id, user, status, note) {
    const row = workRepo.findById(id);
    if (!row) throw AppError.notFound('作品不存在');
    if (row.user_id !== user.id && user.role !== 'admin') throw AppError.forbidden('没有操作权限');
    if (!['approved', 'offline', 'pending', 'rejected', 'draft'].includes(status)) {
      throw AppError.param('状态不合法');
    }
    workRepo.setStatus(id, status, note);

    if (row.user_id !== user.id && ['approved', 'rejected', 'offline'].includes(status)) {
      notificationService.push({
        userId: row.user_id,
        actorId: user.id,
        type: notificationService.TYPE.AUDIT,
        title:
          status === 'approved'
            ? `作品「${row.title}」已通过审核`
            : status === 'rejected'
            ? `作品「${row.title}」未通过审核`
            : `作品「${row.title}」已被下架`,
        content: note || null,
        targetType: 'work',
        targetId: id,
      });
    }
    return mapWork(workRepo.findById(id), { userId: user.id });
  },

  remove(id, user) {
    const row = workRepo.findById(id);
    if (!row) throw AppError.notFound('作品不存在');
    if (row.user_id !== user.id && user.role !== 'admin') throw AppError.forbidden('只能删除自己的作品');
    interactionRepo.removeByTarget('work', id);
    workRepo.remove(id);
    return true;
  },

  /* ---------- 点赞 ---------- */
  like(id, user) {
    const row = workRepo.findById(id);
    if (!row) throw AppError.notFound('作品不存在');

    const added = interactionRepo.add({
      id: genId('int'),
      userId: user.id,
      targetType: 'work',
      targetId: id,
      action: 'like',
    });
    if (!added) return { liked: true, likesCount: row.likes_count };

    workRepo.incCounter(id, 'likes_count', 1);
    notificationService.push({
      userId: row.user_id,
      actorId: user.id,
      type: notificationService.TYPE.LIKE,
      title: `${user.display_name || user.username} 赞了你的作品`,
      content: row.title,
      targetType: 'work',
      targetId: id,
    });
    return { liked: true, likesCount: row.likes_count + 1 };
  },

  unlike(id, user) {
    const row = workRepo.findById(id);
    if (!row) throw AppError.notFound('作品不存在');
    const removed = interactionRepo.remove({ userId: user.id, targetType: 'work', targetId: id, action: 'like' });
    if (removed) workRepo.incCounter(id, 'likes_count', -1);
    return { liked: false, likesCount: Math.max(0, row.likes_count - (removed ? 1 : 0)) };
  },

  /* ---------- 收藏 ---------- */
  favorite(id, user) {
    const row = workRepo.findById(id);
    if (!row) throw AppError.notFound('作品不存在');
    const added = interactionRepo.add({
      id: genId('int'),
      userId: user.id,
      targetType: 'work',
      targetId: id,
      action: 'favorite',
    });
    if (added) workRepo.incCounter(id, 'favorites_count', 1);
    return { favorited: true };
  },

  unfavorite(id, user) {
    const removed = interactionRepo.remove({ userId: user.id, targetType: 'work', targetId: id, action: 'favorite' });
    if (removed) workRepo.incCounter(id, 'favorites_count', -1);
    return { favorited: false };
  },

  /* ---------- 我的 ---------- */
  myWorks(userId, query) {
    const { list, total } = workRepo.search({
      userId,
      limit: query.limit,
      offset: query.offset,
      sortBy: 'w.created_at DESC',
    });
    return { list: list.map((r) => mapWork(r, { userId })), total };
  },

  workTypes() {
    return workRepo.workTypes();
  },
};

module.exports = { workService, mapWork };
