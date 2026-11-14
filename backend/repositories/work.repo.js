// repositories/work.repo.js —— 作品表 SQL 层
const { db } = require('../db/database');

const workRepo = {
  search({ status, userId, heritageId, projectId, workType, keyword, sortBy = 'w.created_at DESC', limit, offset }) {
    const where = ['1 = 1'];
    const params = {};
    if (status) {
      where.push('w.status = @status');
      params.status = status;
    }
    if (userId) {
      where.push('w.user_id = @userId');
      params.userId = userId;
    }
    if (heritageId) {
      where.push('w.heritage_id = @heritageId');
      params.heritageId = heritageId;
    }
    if (projectId) {
      where.push('w.project_id = @projectId');
      params.projectId = projectId;
    }
    if (workType) {
      where.push('w.work_type = @workType');
      params.workType = workType;
    }
    if (keyword) {
      where.push('(w.title LIKE @kw OR w.summary LIKE @kw OR w.tags LIKE @kw)');
      params.kw = `%${keyword}%`;
    }
    const whereSql = where.join(' AND ');

    const total = db.prepare(`SELECT COUNT(*) AS n FROM work w WHERE ${whereSql}`).get(params).n;
    const list = db
      .prepare(
        `SELECT w.*, u.username, u.display_name, u.avatar, h.name AS heritage_name
         FROM work w
         LEFT JOIN users u ON u.id = w.user_id
         LEFT JOIN heritage h ON h.id = w.heritage_id
         WHERE ${whereSql} ORDER BY ${sortBy} LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });
    return { list, total };
  },

  findById(id) {
    return db
      .prepare(
        `SELECT w.*, u.username, u.display_name, u.avatar, u.role AS author_role,
                h.name AS heritage_name, p.title AS project_title
         FROM work w
         LEFT JOIN users u ON u.id = w.user_id
         LEFT JOIN heritage h ON h.id = w.heritage_id
         LEFT JOIN co_project p ON p.id = w.project_id
         WHERE w.id = ?`
      )
      .get(id);
  },

  create(row) {
    db.prepare(
      `INSERT INTO work (id, user_id, heritage_id, project_id, title, work_type, summary, content,
        cover_url, file_url, tags, status)
       VALUES (@id, @user_id, @heritage_id, @project_id, @title, @work_type, @summary, @content,
        @cover_url, @file_url, @tags, @status)`
    ).run(row);
    return this.findById(row.id);
  },

  update(id, patch) {
    const keys = Object.keys(patch);
    if (!keys.length) return this.findById(id);
    const setSql = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE work SET ${setSql}, updated_at = datetime('now','localtime') WHERE id = @id`).run({
      ...patch,
      id,
    });
    return this.findById(id);
  },

  setStatus(id, status, note) {
    db.prepare(
      `UPDATE work SET status = ?, audit_note = ?, updated_at = datetime('now','localtime') WHERE id = ?`
    ).run(status, note || null, id);
  },

  remove(id) {
    db.prepare('DELETE FROM work WHERE id = ?').run(id);
  },

  incViews(id) {
    db.prepare('UPDATE work SET views_count = views_count + 1 WHERE id = ?').run(id);
  },

  incCounter(id, field, delta) {
    const allowed = ['likes_count', 'favorites_count', 'comments_count'];
    if (!allowed.includes(field)) return;
    db.prepare(`UPDATE work SET ${field} = MAX(0, ${field} + ?) WHERE id = ?`).run(delta, id);
  },

  countAll() {
    return db.prepare('SELECT COUNT(*) AS n FROM work').get().n;
  },

  countByStatus(status) {
    return db.prepare('SELECT COUNT(*) AS n FROM work WHERE status = ?').get(status).n;
  },

  pending({ limit, offset }) {
    const total = db.prepare("SELECT COUNT(*) AS n FROM work WHERE status = 'pending'").get().n;
    const list = db
      .prepare(
        `SELECT w.*, u.username, u.display_name FROM work w
         JOIN users u ON u.id = w.user_id
         WHERE w.status = 'pending' ORDER BY w.created_at ASC LIMIT ? OFFSET ?`
      )
      .all(limit, offset);
    return { list, total };
  },

  /** 作品类型下拉用 */
  workTypes() {
    return db
      .prepare("SELECT work_type, COUNT(*) AS n FROM work WHERE work_type IS NOT NULL GROUP BY work_type ORDER BY n DESC")
      .all();
  },

  /** 推荐：按非遗项目召回 */
  topByHeritage(heritageIds = [], limit = 6) {
    if (!heritageIds.length) {
      return db
        .prepare("SELECT * FROM work WHERE status = 'approved' ORDER BY likes_count DESC LIMIT ?")
        .all(limit);
    }
    const ph = heritageIds.map(() => '?').join(',');
    return db
      .prepare(
        `SELECT * FROM work WHERE status = 'approved' AND heritage_id IN (${ph})
         ORDER BY likes_count DESC LIMIT ?`
      )
      .all(...heritageIds, limit);
  },
};

module.exports = { workRepo };
