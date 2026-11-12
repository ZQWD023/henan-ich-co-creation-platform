// repositories/social.repo.js —— 互动（点赞/收藏/关注）、评论、通知、话题
const { db } = require('../db/database');

const interactionRepo = {
  /** 加一条互动，返回是否真的新增（重复点返回 false） */
  add({ id, userId, targetType, targetId, action }) {
    const r = db
      .prepare(
        `INSERT OR IGNORE INTO interaction (id, user_id, target_type, target_id, action)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, userId, targetType, targetId, action);
    return r.changes > 0;
  },
  remove({ userId, targetType, targetId, action }) {
    const r = db
      .prepare('DELETE FROM interaction WHERE user_id = ? AND target_type = ? AND target_id = ? AND action = ?')
      .run(userId, targetType, targetId, action);
    return r.changes > 0;
  },
  exists({ userId, targetType, targetId, action }) {
    return Boolean(
      db
        .prepare('SELECT 1 FROM interaction WHERE user_id = ? AND target_type = ? AND target_id = ? AND action = ?')
        .get(userId, targetType, targetId, action)
    );
  },
  count(targetType, targetId, action) {
    return db
      .prepare('SELECT COUNT(*) AS n FROM interaction WHERE target_type = ? AND target_id = ? AND action = ?')
      .get(targetType, targetId, action).n;
  },
  /** 我点过赞/收藏的目标 ID 集合（用于列表里回填"已赞"状态） */
  myTargetIds(userId, targetType, action) {
    return db
      .prepare('SELECT target_id FROM interaction WHERE user_id = ? AND target_type = ? AND action = ?')
      .all(userId, targetType, action)
      .map((r) => r.target_id);
  },
  /** 我收藏的作品/项目（联表取详情） */
  myFavorites(userId, targetType) {
    return db
      .prepare(
        `SELECT i.target_id, i.created_at FROM interaction i
         WHERE i.user_id = ? AND i.action = 'favorite' AND i.target_type = ?
         ORDER BY i.created_at DESC`
      )
      .all(userId, targetType);
  },
  /** 关注数 / 粉丝数 */
  followingCount(userId) {
    return db
      .prepare("SELECT COUNT(*) AS n FROM interaction WHERE user_id = ? AND action = 'follow' AND target_type = 'user'")
      .get(userId).n;
  },
  followerCount(userId) {
    return db
      .prepare("SELECT COUNT(*) AS n FROM interaction WHERE target_id = ? AND action = 'follow' AND target_type = 'user'")
      .get(userId).n;
  },
  followers(userId) {
    return db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.avatar, u.role
         FROM interaction i JOIN users u ON u.id = i.user_id
         WHERE i.target_id = ? AND i.action = 'follow' AND i.target_type = 'user'`
      )
      .all(userId);
  },
  followings(userId) {
    return db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.avatar, u.role
         FROM interaction i JOIN users u ON u.id = i.target_id
         WHERE i.user_id = ? AND i.action = 'follow' AND i.target_type = 'user'`
      )
      .all(userId);
  },
  /** 用户最近行为，供推荐用 */
  recentActions(userId, limit = 50) {
    return db
      .prepare('SELECT target_type, target_id, action, created_at FROM interaction WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit);
  },
  removeByTarget(targetType, targetId) {
    db.prepare('DELETE FROM interaction WHERE target_type = ? AND target_id = ?').run(targetType, targetId);
  },
};

const commentRepo = {
  create(row) {
    db.prepare(
      `INSERT INTO comment (id, user_id, target_type, target_id, content, parent_id)
       VALUES (@id, @user_id, @target_type, @target_id, @content, @parent_id)`
    ).run(row);
    return this.findById(row.id);
  },
  findById(id) {
    return db.prepare('SELECT * FROM comment WHERE id = ?').get(id);
  },
  listByTarget({ targetType, targetId, limit, offset }) {
    const total = db
      .prepare("SELECT COUNT(*) AS n FROM comment WHERE target_type = ? AND target_id = ? AND status = 'visible'")
      .get(targetType, targetId).n;
    const rows = db
      .prepare(
        `SELECT c.*, u.username, u.display_name, u.avatar FROM comment c
         JOIN users u ON u.id = c.user_id
         WHERE c.target_type = ? AND c.target_id = ? AND c.status = 'visible'
         ORDER BY c.created_at ASC LIMIT ? OFFSET ?`
      )
      .all(targetType, targetId, limit, offset);
    return { rows, total };
  },
  replies(parentId) {
    return db
      .prepare(
        `SELECT c.*, u.username, u.display_name, u.avatar FROM comment c
         JOIN users u ON u.id = c.user_id
         WHERE c.parent_id = ? AND c.status = 'visible' ORDER BY c.created_at ASC`
      )
      .all(parentId);
  },
  setStatus(id, status) {
    db.prepare('UPDATE comment SET status = ? WHERE id = ?').run(status, id);
  },
  countAll() {
    return db.prepare("SELECT COUNT(*) AS n FROM comment WHERE status = 'visible'").get().n;
  },
  recent({ limit, offset }) {
    const total = db.prepare('SELECT COUNT(*) AS n FROM comment').get().n;
    const rows = db
      .prepare(
        `SELECT c.*, u.username, u.display_name FROM comment c
         JOIN users u ON u.id = c.user_id ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset);
    return { rows, total };
  },
};

const notificationRepo = {
  create(row) {
    db.prepare(
      `INSERT INTO notification (id, user_id, type, title, content, target_type, target_id)
       VALUES (@id, @user_id, @type, @title, @content, @target_type, @target_id)`
    ).run(row);
  },
  listByUser({ userId, onlyUnread, limit, offset }) {
    const where = ['user_id = @userId'];
    if (onlyUnread) where.push('is_read = 0');
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM notification WHERE ${whereSql}`).get({ userId }).n;
    const list = db
      .prepare(`SELECT * FROM notification WHERE ${whereSql} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
      .all({ userId, limit, offset });
    return { list, total };
  },
  unreadCount(userId) {
    return db.prepare('SELECT COUNT(*) AS n FROM notification WHERE user_id = ? AND is_read = 0').get(userId).n;
  },
  markRead(id, userId) {
    const r = db.prepare('UPDATE notification SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
    return r.changes > 0;
  },
  markAllRead(userId) {
    const r = db.prepare('UPDATE notification SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(userId);
    return r.changes;
  },
};

const topicRepo = {
  list() {
    return db.prepare('SELECT * FROM topic ORDER BY work_count DESC, name ASC').all();
  },
  findByName(name) {
    return db.prepare('SELECT * FROM topic WHERE name = ?').get(name);
  },
  create(row) {
    db.prepare('INSERT INTO topic (id, name, description) VALUES (@id, @name, @description)').run(row);
    return this.findByName(row.name);
  },
  bindWork(workId, topicId) {
    db.prepare('INSERT OR IGNORE INTO work_topic (work_id, topic_id) VALUES (?, ?)').run(workId, topicId);
  },
  worksOf(topicId, { limit, offset }) {
    const total = db.prepare('SELECT COUNT(*) AS n FROM work_topic WHERE topic_id = ?').get(topicId).n;
    const list = db
      .prepare(
        `SELECT w.*, u.username, u.display_name FROM work_topic wt
         JOIN work w ON w.id = wt.work_id JOIN users u ON u.id = w.user_id
         WHERE wt.topic_id = ? AND w.status = 'approved'
         ORDER BY w.likes_count DESC LIMIT ? OFFSET ?`
      )
      .all(topicId, limit, offset);
    return { list, total };
  },
  refreshCount(topicId) {
    db.prepare('UPDATE topic SET work_count = (SELECT COUNT(*) FROM work_topic WHERE topic_id = ?) WHERE id = ?').run(
      topicId,
      topicId
    );
  },
};

const auditRepo = {
  create(row) {
    db.prepare(
      `INSERT INTO audit_log (id, admin_id, target_type, target_id, action, note)
       VALUES (@id, @admin_id, @target_type, @target_id, @action, @note)`
    ).run(row);
  },
  recent(limit = 20) {
    return db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit);
  },
};

module.exports = { interactionRepo, commentRepo, notificationRepo, topicRepo, auditRepo };
