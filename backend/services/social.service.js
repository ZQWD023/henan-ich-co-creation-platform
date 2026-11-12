// services/social.service.js —— 评论 / 通用点赞收藏 / 话题
const { AppError } = require('../utils/response');
const { genId } = require('../utils/id');
const { db } = require('../db/database');
const { interactionRepo, commentRepo, topicRepo } = require('../repositories/social.repo');
const { notificationService } = require('./notification.service');

const TARGET_TYPES = ['work', 'project', 'heritage', 'comment'];

/** 目标是否存在（防止给不存在的对象点赞/评论） */
const TARGET_TABLE = { work: 'work', project: 'co_project', heritage: 'heritage', comment: 'comment', user: 'users' };

function assertTarget(targetType, targetId) {
  if (!TARGET_TABLE[targetType]) throw AppError.param(`不支持的目标类型：${targetType}`);
  const row = db.prepare(`SELECT id FROM ${TARGET_TABLE[targetType]} WHERE id = ?`).get(targetId);
  if (!row) throw AppError.notFound('目标内容不存在');
  return row;
}

/** 目标作者，用于发通知 */
function targetOwner(targetType, targetId) {
  const map = {
    work: ['work', 'user_id'],
    project: ['co_project', 'owner_id'],
    heritage: [null, null],
    comment: ['comment', 'user_id'],
  };
  const [table, field] = map[targetType] || [];
  if (!table) return null;
  const row = db.prepare(`SELECT ${field} AS owner FROM ${table} WHERE id = ?`).get(targetId);
  return row ? row.owner : null;
}

const socialService = {
  TARGET_TYPES,

  /* ---------------- 评论 ---------------- */
  createComment(user, { targetType, targetId, content, parentId }) {
    if (!TARGET_TYPES.includes(targetType)) throw AppError.param('评论目标类型不合法');
    assertTarget(targetType, targetId);

    if (parentId) {
      const parent = commentRepo.findById(parentId);
      if (!parent) throw AppError.notFound('要回复的评论不存在');
      if (parent.target_type !== targetType || parent.target_id !== targetId) {
        throw AppError.param('回复的评论不属于同一内容');
      }
    }

    const row = commentRepo.create({
      id: genId('cmt'),
      user_id: user.id,
      target_type: targetType,
      target_id: targetId,
      content,
      parent_id: parentId || null,
    });

    if (targetType === 'work') {
      db.prepare('UPDATE work SET comments_count = comments_count + 1 WHERE id = ?').run(targetId);
    }

    // 通知：内容作者 + 被回复者
    const owner = targetOwner(targetType, targetId);
    if (owner) {
      notificationService.push({
        userId: owner,
        actorId: user.id,
        type: notificationService.TYPE.COMMENT,
        title: `${user.display_name || user.username} 评论了你`,
        content: content.slice(0, 60),
        targetType,
        targetId,
      });
    }
    if (parentId) {
      const parent = commentRepo.findById(parentId);
      if (parent && parent.user_id !== owner) {
        notificationService.push({
          userId: parent.user_id,
          actorId: user.id,
          type: notificationService.TYPE.COMMENT,
          title: `${user.display_name || user.username} 回复了你的评论`,
          content: content.slice(0, 60),
          targetType,
          targetId,
        });
      }
    }

    return this.mapComment(row, user);
  },

  mapComment(c, viewer) {
    return {
      id: c.id,
      targetType: c.target_type,
      targetId: c.target_id,
      content: c.content,
      parentId: c.parent_id,
      likesCount: c.likes_count,
      status: c.status,
      createdAt: c.created_at,
      user: {
        id: c.user_id,
        username: c.username,
        displayName: c.display_name || c.username,
        avatar: c.avatar,
      },
      liked: viewer
        ? interactionRepo.exists({ userId: viewer.id, targetType: 'comment', targetId: c.id, action: 'like' })
        : false,
      replies: [],
    };
  },

  listComments({ targetType, targetId, limit, offset }, viewer) {
    const { rows, total } = commentRepo.listByTarget({ targetType, targetId, limit, offset });
    const list = rows.map((r) => this.mapComment(r, viewer));

    // 一层楼中楼：把子回复挂到父评论下
    const byId = new Map(list.map((c) => [c.id, c]));
    const roots = [];
    for (const c of list) {
      if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId).replies.push(c);
      else roots.push(c);
    }
    return { list: roots, total };
  },

  deleteComment(id, user) {
    const c = commentRepo.findById(id);
    if (!c) throw AppError.notFound('评论不存在');
    if (c.user_id !== user.id && user.role !== 'admin') throw AppError.forbidden('只能删除自己的评论');
    commentRepo.setStatus(id, 'deleted');
    if (c.target_type === 'work') {
      db.prepare('UPDATE work SET comments_count = MAX(0, comments_count - 1) WHERE id = ?').run(c.target_id);
    }
    return true;
  },

  /* ---------------- 通用点赞 / 收藏 ---------------- */
  toggleInteraction(user, { targetType, targetId, action }) {
    if (!['like', 'favorite'].includes(action)) throw AppError.param('action 只能是 like 或 favorite');
    if (!TARGET_TYPES.includes(targetType)) throw AppError.param('目标类型不合法');
    assertTarget(targetType, targetId);

    const exists = interactionRepo.exists({ userId: user.id, targetType, targetId, action });
    if (exists) {
      interactionRepo.remove({ userId: user.id, targetType, targetId, action });
      this._syncCounter(targetType, targetId, action, -1);
      return { active: false, action };
    }

    interactionRepo.add({ id: genId('int'), userId: user.id, targetType, targetId, action });
    this._syncCounter(targetType, targetId, action, 1);

    if (action === 'like') {
      const owner = targetOwner(targetType, targetId);
      notificationService.push({
        userId: owner,
        actorId: user.id,
        type: notificationService.TYPE.LIKE,
        title: `${user.display_name || user.username} 赞了你`,
        targetType,
        targetId,
      });
    }
    return { active: true, action };
  },

  _syncCounter(targetType, targetId, action, delta) {
    if (targetType === 'work') {
      const field = action === 'like' ? 'likes_count' : 'favorites_count';
      db.prepare(`UPDATE work SET ${field} = MAX(0, ${field} + ?) WHERE id = ?`).run(delta, targetId);
    }
    if (targetType === 'project' && action === 'like') {
      // 项目点赞数未单独建字段，用 views_count 之外的统计接口实时算
    }
    if (targetType === 'comment' && action === 'like') {
      db.prepare('UPDATE comment SET likes_count = MAX(0, likes_count + ?) WHERE id = ?').run(delta, targetId);
    }
  },

  /** 我点过赞/收藏的目标 ID，列表页回填状态用 */
  myInteractionIds(user, { targetType, action }) {
    return interactionRepo.myTargetIds(user.id, targetType, action);
  },

  /* ---------------- 话题 ---------------- */
  listTopics() {
    return topicRepo.list();
  },
  createTopic(user, { name, description }) {
    if (user.role === 'user') throw AppError.forbidden('只有认证创作者可以创建话题');
    const exist = topicRepo.findByName(name);
    if (exist) throw AppError.conflict('话题已存在');
    return topicRepo.create({ id: genId('topic'), name, description: description || null });
  },
  topicWorks(name, { limit, offset }) {
    const t = topicRepo.findByName(name);
    if (!t) throw AppError.notFound('话题不存在');
    const { list, total } = topicRepo.worksOf(t.id, { limit, offset });
    return { topic: t, list, total };
  },
};

module.exports = { socialService, TARGET_TYPES };
