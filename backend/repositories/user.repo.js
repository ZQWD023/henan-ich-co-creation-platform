// repositories/user.repo.js —— 用户与认证的 SQL 层
const { db } = require('../db/database');

const userRepo = {
  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  findByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },
  findByUsernameOrEmail(username, email) {
    return db.prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ?').get(username, email);
  },
  create(row) {
    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, display_name, avatar, bio, role, cert_status, joined_date)
       VALUES (@id, @username, @email, @password_hash, @display_name, @avatar, @bio, @role, @cert_status, @joined_date)`
    ).run(row);
    return this.findById(row.id);
  },
  updateProfile(id, patch) {
    const keys = Object.keys(patch);
    if (!keys.length) return this.findById(id);
    const setSql = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE users SET ${setSql}, updated_at = datetime('now','localtime') WHERE id = @id`).run({ ...patch, id });
    return this.findById(id);
  },
  updatePassword(id, hash) {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(hash, id);
  },
  touchLogin(id) {
    db.prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(id);
  },
  setRole(id, role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  },
  setStatus(id, status) {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
  },
  remove(id) {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  /** 管理台用户列表 */
  list({ keyword, role, status, limit, offset }) {
    const where = ['1 = 1'];
    const params = {};
    if (keyword) {
      where.push('(username LIKE @kw OR display_name LIKE @kw OR email LIKE @kw)');
      params.kw = `%${keyword}%`;
    }
    if (role) {
      where.push('role = @role');
      params.role = role;
    }
    if (status) {
      where.push('status = @status');
      params.status = status;
    }
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE ${whereSql}`).get(params).n;
    const list = db
      .prepare(
        `SELECT id, username, email, display_name, avatar, role, cert_status, status, joined_date, last_login_at
         FROM users WHERE ${whereSql} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });
    return { list, total };
  },

  countAll() {
    return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  },

  countByRole(role) {
    return db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ?').get(role).n;
  },
};

const certRepo = {
  create(row) {
    db.prepare(
      `INSERT INTO user_certification (id, user_id, real_name, heritage_id, level, title, intro, material_url, status)
       VALUES (@id, @user_id, @real_name, @heritage_id, @level, @title, @intro, @material_url, 'pending')`
    ).run(row);
    return this.findById(row.id);
  },
  findById(id) {
    return db.prepare('SELECT * FROM user_certification WHERE id = ?').get(id);
  },
  /** 某用户最近一次申请 */
  latestByUser(userId) {
    return db
      .prepare('SELECT * FROM user_certification WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(userId);
  },
  listPending({ limit, offset }) {
    const total = db.prepare("SELECT COUNT(*) AS n FROM user_certification WHERE status = 'pending'").get().n;
    const list = db
      .prepare(
        `SELECT c.*, u.username, u.display_name FROM user_certification c
         JOIN users u ON u.id = c.user_id
         WHERE c.status = 'pending' ORDER BY c.created_at ASC LIMIT ? OFFSET ?`
      )
      .all(limit, offset);
    return { list, total };
  },
  review(id, { status, note, reviewerId }) {
    db.prepare(
      `UPDATE user_certification SET status = ?, review_note = ?, reviewer_id = ?,
       reviewed_at = datetime('now','localtime') WHERE id = ?`
    ).run(status, note || null, reviewerId, id);
    return this.findById(id);
  },
};

module.exports = { userRepo, certRepo };
