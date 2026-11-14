// repositories/project.repo.js —— 共创协作（项目/成员/任务/版本/讨论）SQL 层
const { db } = require('../db/database');

const projectRepo = {
  search({ status, heritageId, ownerId, memberOf, keyword, sortBy = 'p.created_at DESC', limit, offset }) {
    const where = ['1 = 1'];
    const params = {};
    if (status) {
      where.push('p.status = @status');
      params.status = status;
    }
    if (heritageId) {
      where.push('p.heritage_id = @heritageId');
      params.heritageId = heritageId;
    }
    if (ownerId) {
      where.push('p.owner_id = @ownerId');
      params.ownerId = ownerId;
    }
    if (memberOf) {
      where.push(
        "p.id IN (SELECT project_id FROM co_member WHERE user_id = @memberOf AND status = 'approved')"
      );
      params.memberOf = memberOf;
    }
    if (keyword) {
      where.push('(p.title LIKE @kw OR p.description LIKE @kw OR p.recruit_need LIKE @kw)');
      params.kw = `%${keyword}%`;
    }
    const whereSql = where.join(' AND ');

    const total = db.prepare(`SELECT COUNT(*) AS n FROM co_project p WHERE ${whereSql}`).get(params).n;
    const list = db
      .prepare(
        `SELECT p.*, u.username AS owner_name, u.display_name AS owner_display, u.avatar AS owner_avatar,
                h.name AS heritage_name,
                (SELECT COUNT(*) FROM co_task t WHERE t.project_id = p.id) AS task_total,
                (SELECT COUNT(*) FROM co_task t WHERE t.project_id = p.id AND t.status = 'done') AS task_done
         FROM co_project p
         LEFT JOIN users u ON u.id = p.owner_id
         LEFT JOIN heritage h ON h.id = p.heritage_id
         WHERE ${whereSql} ORDER BY ${sortBy} LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });

    return { list, total };
  },

  findById(id) {
    return db
      .prepare(
        `SELECT p.*, u.username AS owner_name, u.display_name AS owner_display, u.avatar AS owner_avatar,
                h.name AS heritage_name
         FROM co_project p
         LEFT JOIN users u ON u.id = p.owner_id
         LEFT JOIN heritage h ON h.id = p.heritage_id
         WHERE p.id = ?`
      )
      .get(id);
  },

  create(row) {
    db.prepare(
      `INSERT INTO co_project (id, owner_id, heritage_id, title, cover_url, description, recruit_need,
        member_limit, deadline, status)
       VALUES (@id, @owner_id, @heritage_id, @title, @cover_url, @description, @recruit_need,
        @member_limit, @deadline, @status)`
    ).run(row);
    return this.findById(row.id);
  },

  update(id, patch) {
    const keys = Object.keys(patch);
    if (!keys.length) return this.findById(id);
    const setSql = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE co_project SET ${setSql}, updated_at = datetime('now','localtime') WHERE id = @id`).run({
      ...patch,
      id,
    });
    return this.findById(id);
  },

  setStatus(id, status) {
    const extra = status === 'closed' ? ", closed_at = datetime('now','localtime')" : '';
    db.prepare(
      `UPDATE co_project SET status = ?, updated_at = datetime('now','localtime')${extra} WHERE id = ?`
    ).run(status, id);
  },

  incViews(id) {
    db.prepare('UPDATE co_project SET views_count = views_count + 1 WHERE id = ?').run(id);
  },

  refreshMemberCount(id) {
    db.prepare(
      `UPDATE co_project SET members_count =
        (SELECT COUNT(*) FROM co_member WHERE project_id = ? AND status = 'approved') WHERE id = ?`
    ).run(id, id);
  },

  countAll() {
    return db.prepare('SELECT COUNT(*) AS n FROM co_project').get().n;
  },

  countByStatus(status) {
    return db.prepare('SELECT COUNT(*) AS n FROM co_project WHERE status = ?').get(status).n;
  },

  recent(limit = 5) {
    return db
      .prepare(
        `SELECT p.id, p.title, p.status, p.created_at, u.display_name AS owner
         FROM co_project p LEFT JOIN users u ON u.id = p.owner_id
         ORDER BY p.created_at DESC LIMIT ?`
      )
      .all(limit);
  },
};

const memberRepo = {
  find(projectId, userId) {
    return db.prepare('SELECT * FROM co_member WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  },
  findById(id) {
    return db.prepare('SELECT * FROM co_member WHERE id = ?').get(id);
  },
  list(projectId, { status } = {}) {
    const where = ['m.project_id = @projectId'];
    const params = { projectId };
    if (status) {
      where.push('m.status = @status');
      params.status = status;
    }
    return db
      .prepare(
        `SELECT m.*, u.username, u.display_name, u.avatar, u.role AS user_role
         FROM co_member m JOIN users u ON u.id = m.user_id
         WHERE ${where.join(' AND ')} ORDER BY m.joined_at ASC`
      )
      .all(params);
  },
  countApproved(projectId) {
    return db
      .prepare("SELECT COUNT(*) AS n FROM co_member WHERE project_id = ? AND status = 'approved'")
      .get(projectId).n;
  },
  create(row) {
    db.prepare(
      `INSERT INTO co_member (id, project_id, user_id, role, apply_reason, status, reviewed_by)
       VALUES (@id, @project_id, @user_id, @role, @apply_reason, @status, @reviewed_by)`
    ).run(row);
    return this.findById(row.id);
  },
  setStatus(id, status, reviewerId) {
    db.prepare(
      `UPDATE co_member SET status = ?, reviewed_by = ?, reviewed_at = datetime('now','localtime') WHERE id = ?`
    ).run(status, reviewerId || null, id);
    return this.findById(id);
  },
  setRole(id, role) {
    db.prepare('UPDATE co_member SET role = ? WHERE id = ?').run(role, id);
    return this.findById(id);
  },
  /** 我参与的项目 */
  myProjects(userId, { status, limit, offset }) {
    const where = ['m.user_id = @userId'];
    const params = { userId };
    if (status) {
      where.push('m.status = @status');
      params.status = status;
    }
    return db
      .prepare(
        `SELECT m.id AS member_id, m.role, m.status, m.joined_at, p.*
         FROM co_member m JOIN co_project p ON p.id = m.project_id
         WHERE ${where.join(' AND ')} ORDER BY m.joined_at DESC LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });
  },
};

const taskRepo = {
  list(projectId, { status, assigneeId } = {}) {
    const where = ['project_id = @projectId'];
    const params = { projectId };
    if (status) {
      where.push('status = @status');
      params.status = status;
    }
    if (assigneeId) {
      where.push('assignee_id = @assigneeId');
      params.assigneeId = assigneeId;
    }
    return db
      .prepare(
        `SELECT t.*, u.display_name AS assignee_name, u.avatar AS assignee_avatar
         FROM co_task t LEFT JOIN users u ON u.id = t.assignee_id
         WHERE ${where.join(' AND ')} ORDER BY
           CASE t.status WHEN 'doing' THEN 0 WHEN 'review' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
           t.deadline IS NULL, t.deadline ASC`
      )
      .all(params);
  },
  findById(id) {
    return db.prepare('SELECT * FROM co_task WHERE id = ?').get(id);
  },
  create(row) {
    db.prepare(
      `INSERT INTO co_task (id, project_id, title, description, assignee_id, created_by, deadline, status, progress)
       VALUES (@id, @project_id, @title, @description, @assignee_id, @created_by, @deadline, @status, @progress)`
    ).run(row);
    return this.findById(row.id);
  },
  update(id, patch) {
    const keys = Object.keys(patch);
    if (!keys.length) return this.findById(id);
    const setSql = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE co_task SET ${setSql}, updated_at = datetime('now','localtime') WHERE id = @id`).run({
      ...patch,
      id,
    });
    return this.findById(id);
  },
  remove(id) {
    db.prepare('DELETE FROM co_task WHERE id = ?').run(id);
  },
  /** 我的待办（跨项目） */
  myTasks(userId, { status, limit, offset }) {
    const where = ['t.assignee_id = @userId'];
    const params = { userId };
    if (status) {
      where.push('t.status = @status');
      params.status = status;
    }
    return db
      .prepare(
        `SELECT t.*, p.title AS project_title FROM co_task t
         JOIN co_project p ON p.id = t.project_id
         WHERE ${where.join(' AND ')} ORDER BY t.deadline IS NULL, t.deadline ASC LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });
  },
  stats(projectId) {
    return db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) AS review,
                AVG(progress) AS avg_progress
         FROM co_task WHERE project_id = ?`
      )
      .get(projectId);
  },
};

const versionRepo = {
  list(projectId) {
    return db
      .prepare(
        `SELECT v.*, u.display_name AS submitter_name FROM co_version v
         LEFT JOIN users u ON u.id = v.submitter_id
         WHERE v.project_id = ? ORDER BY v.version_no DESC`
      )
      .all(projectId);
  },
  findById(id) {
    return db.prepare('SELECT * FROM co_version WHERE id = ?').get(id);
  },
  nextVersionNo(projectId) {
    const row = db.prepare('SELECT MAX(version_no) AS m FROM co_version WHERE project_id = ?').get(projectId);
    return (row.m || 0) + 1;
  },
  create(row) {
    db.prepare(
      `INSERT INTO co_version (id, project_id, version_no, title, content, file_url, cover_url, submitter_id, is_final)
       VALUES (@id, @project_id, @version_no, @title, @content, @file_url, @cover_url, @submitter_id, @is_final)`
    ).run(row);
    return this.findById(row.id);
  },
  setFinal(projectId, versionId) {
    db.prepare('UPDATE co_version SET is_final = 0 WHERE project_id = ?').run(projectId);
    db.prepare('UPDATE co_version SET is_final = 1 WHERE id = ?').run(versionId);
  },
  findFinal(projectId) {
    return db.prepare('SELECT * FROM co_version WHERE project_id = ? AND is_final = 1').get(projectId);
  },
};

const discussionRepo = {
  list(projectId, { limit, offset }) {
    const total = db.prepare('SELECT COUNT(*) AS n FROM co_discussion WHERE project_id = ?').get(projectId).n;
    const list = db
      .prepare(
        `SELECT d.*, u.display_name AS user_name, u.avatar AS user_avatar, u.role AS user_role,
                r.content AS reply_content, ru.display_name AS reply_user
         FROM co_discussion d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN co_discussion r ON r.id = d.reply_to
         LEFT JOIN users ru ON ru.id = r.user_id
         WHERE d.project_id = ? ORDER BY d.created_at ASC LIMIT ? OFFSET ?`
      )
      .all(projectId, limit, offset);
    return { list, total };
  },
  create(row) {
    db.prepare(
      `INSERT INTO co_discussion (id, project_id, user_id, content, reply_to, mentions)
       VALUES (@id, @project_id, @user_id, @content, @reply_to, @mentions)`
    ).run(row);
    return db.prepare('SELECT * FROM co_discussion WHERE id = ?').get(row.id);
  },
  count(projectId) {
    return db.prepare('SELECT COUNT(*) AS n FROM co_discussion WHERE project_id = ?').get(projectId).n;
  },
};

module.exports = { projectRepo, memberRepo, taskRepo, versionRepo, discussionRepo };
