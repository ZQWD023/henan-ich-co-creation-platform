// services/notification.service.js —— 消息通知（统一出口，其它 service 只管调它）
const { genId } = require('../utils/id');
const { notificationRepo } = require('../repositories/social.repo');

const TYPE = {
  LIKE: 'like',
  COMMENT: 'comment',
  FOLLOW: 'follow',
  PROJECT: 'project_progress',
  AUDIT: 'audit',
  SYSTEM: 'system',
};

const notificationService = {
  TYPE,

  /** 发一条通知（不给自己发） */
  push({ userId, actorId, type, title, content, targetType, targetId }) {
    if (!userId || userId === actorId) return;
    notificationRepo.create({
      id: genId('ntf'),
      user_id: userId,
      type,
      title,
      content: content || null,
      target_type: targetType || null,
      target_id: targetId || null,
    });
  },

  list(userId, { onlyUnread, limit, offset }) {
    const { list, total } = notificationRepo.listByUser({ userId, onlyUnread, limit, offset });
    return {
      list: list.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        content: n.content,
        targetType: n.target_type,
        targetId: n.target_id,
        isRead: Boolean(n.is_read),
        createdAt: n.created_at,
      })),
      total,
    };
  },

  unreadCount(userId) {
    return notificationRepo.unreadCount(userId);
  },

  markRead(id, userId) {
    return notificationRepo.markRead(id, userId);
  },

  markAllRead(userId) {
    return notificationRepo.markAllRead(userId);
  },
};

module.exports = { notificationService, NOTI_TYPE: TYPE };
