// repositories/heritage.repo.js —— 非遗内容库的 SQL 层
// 约定：repository 只做 SQL，不做业务判断；返回值一律是数据库原始行
const { db } = require('../db/database');

/* ---------------- 分类 ---------------- */
const categoryRepo = {
  list() {
    return db.prepare('SELECT * FROM category ORDER BY sort_order ASC, name ASC').all();
  },
  findById(id) {
    return db.prepare('SELECT * FROM category WHERE id = ?').get(id);
  },
  countHeritage(categoryId) {
    return db.prepare('SELECT COUNT(*) AS n FROM heritage WHERE category_id = ? AND status = ?').get(categoryId, 'published').n;
  },
  create(row) {
    db.prepare(
      'INSERT INTO category (id, name, icon, color, description, sort_order) VALUES (@id, @name, @icon, @color, @description, @sort_order)'
    ).run(row);
    return this.findById(row.id);
  },
};

/* ---------------- 非遗项目 ---------------- */
const heritageRepo = {
  /**
   * 列表查询：支持分类/地区/级别/关键词/排序 + 分页
   */
  search({ category, region, level, keyword, sortBy = 'popularity DESC', limit, offset }) {
    const where = ["h.status = 'published'"];
    const params = {};
    if (category) {
      where.push('h.category_id = @category');
      params.category = category;
    }
    if (region) {
      where.push('h.region LIKE @region');
      params.region = `%${region}%`;
    }
    if (level) {
      where.push('h.level = @level');
      params.level = level;
    }
    if (keyword) {
      where.push('(h.name LIKE @kw OR h.brief LIKE @kw OR h.tags LIKE @kw OR h.region LIKE @kw)');
      params.kw = `%${keyword}%`;
    }
    const whereSql = where.join(' AND ');

    const total = db.prepare(`SELECT COUNT(*) AS n FROM heritage h WHERE ${whereSql}`).get(params).n;
    const list = db
      .prepare(
        `SELECT h.*, c.name AS category_name
         FROM heritage h LEFT JOIN category c ON c.id = h.category_id
         WHERE ${whereSql} ORDER BY ${sortBy} LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });

    return { list, total };
  },

  findById(id) {
    return db
      .prepare(
        `SELECT h.*, c.name AS category_name FROM heritage h
         LEFT JOIN category c ON c.id = h.category_id WHERE h.id = ?`
      )
      .get(id);
  },

  findManyByIds(ids = []) {
    if (!ids.length) return [];
    const q = `SELECT * FROM heritage WHERE id IN (${ids.map(() => '?').join(',')})`;
    return db.prepare(q).all(...ids);
  },

  incViews(id) {
    db.prepare('UPDATE heritage SET popularity = popularity + 1 WHERE id = ?').run(id);
  },

  create(row) {
    db.prepare(
      `INSERT INTO heritage (id, name, category_id, level, region, year, icon, gradient, brief, intro,
        history, lineage, features, steps, visit, tags, popularity, likes, cover_url)
       VALUES (@id, @name, @category_id, @level, @region, @year, @icon, @gradient, @brief, @intro,
        @history, @lineage, @features, @steps, @visit, @tags, @popularity, @likes, @cover_url)`
    ).run(row);
    return this.findById(row.id);
  },

  update(id, patch) {
    const keys = Object.keys(patch);
    if (!keys.length) return this.findById(id);
    const setSql = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE heritage SET ${setSql}, updated_at = datetime('now','localtime') WHERE id = @id`).run({
      ...patch,
      id,
    });
    return this.findById(id);
  },

  setStatus(id, status) {
    db.prepare("UPDATE heritage SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(status, id);
  },

  countAll() {
    return db.prepare('SELECT COUNT(*) AS n FROM heritage').get().n;
  },

  /** 推荐用：按分类召回，按热度排序 */
  topByCategories(categoryIds = [], limit = 6, excludeIds = []) {
    if (!categoryIds.length) return [];
    const inCat = categoryIds.map(() => '?').join(',');
    const excludeSql = excludeIds.length ? `AND id NOT IN (${excludeIds.map(() => '?').join(',')})` : '';
    return db
      .prepare(
        `SELECT * FROM heritage WHERE status = 'published' AND category_id IN (${inCat}) ${excludeSql}
         ORDER BY popularity DESC LIMIT ?`
      )
      .all(...categoryIds, ...excludeIds, limit);
  },

  regions() {
    return db
      .prepare("SELECT DISTINCT region FROM heritage WHERE region IS NOT NULL AND region <> '' ORDER BY region")
      .all()
      .map((r) => r.region);
  },
};

/* ---------------- 传承人 ---------------- */
const inheritorRepo = {
  list({ heritageId, level, keyword, limit, offset }) {
    // 注意：下面要 JOIN heritage，两张表都有 status / level 列，必须带表别名限定，
    // 否则 SQLite 会报 "ambiguous column name" (500)。
    const where = ["i.status = 'published'"];
    const params = {};
    if (heritageId) {
      where.push('i.heritage_id = @heritageId');
      params.heritageId = heritageId;
    }
    if (level) {
      where.push('i.level = @level');
      params.level = level;
    }
    if (keyword) {
      where.push('(i.name LIKE @kw OR i.title LIKE @kw OR i.bio LIKE @kw)');
      params.kw = `%${keyword}%`;
    }
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM inheritor i WHERE ${whereSql}`).get(params).n;
    const list = db
      .prepare(
        `SELECT i.*, h.name AS heritage_name FROM inheritor i
         LEFT JOIN heritage h ON h.id = i.heritage_id
         WHERE ${whereSql} ORDER BY i.years DESC LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });
    return { list, total };
  },
  findById(id) {
    return db.prepare('SELECT * FROM inheritor WHERE id = ?').get(id);
  },
  findByHeritage(heritageId) {
    return db.prepare("SELECT * FROM inheritor WHERE heritage_id = ? AND status = 'published'").all(heritageId);
  },
};

/* ---------------- 公共素材库 ---------------- */
const materialRepo = {
  list({ type, heritageId, keyword, limit, offset }) {
    const where = ["m.status = 'published'"];
    const params = {};
    if (type) {
      where.push('m.type = @type');
      params.type = type;
    }
    if (heritageId) {
      where.push('m.heritage_id = @heritageId');
      params.heritageId = heritageId;
    }
    if (keyword) {
      where.push('m.title LIKE @kw');
      params.kw = `%${keyword}%`;
    }
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM material m WHERE ${whereSql}`).get(params).n;
    const list = db
      .prepare(`SELECT * FROM material m WHERE ${whereSql} ORDER BY m.created_at DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit, offset });
    return { list, total };
  },
  findById(id) {
    return db.prepare('SELECT * FROM material WHERE id = ?').get(id);
  },
  create(row) {
    db.prepare(
      `INSERT INTO material (id, user_id, heritage_id, title, type, file_url, cover_url, size_bytes)
       VALUES (@id, @user_id, @heritage_id, @title, @type, @file_url, @cover_url, @size_bytes)`
    ).run(row);
    return this.findById(row.id);
  },
  incDownloads(id) {
    db.prepare('UPDATE material SET downloads = downloads + 1 WHERE id = ?').run(id);
  },
  remove(id) {
    db.prepare('DELETE FROM material WHERE id = ?').run(id);
  },
  countAll() {
    return db.prepare('SELECT COUNT(*) AS n FROM material').get().n;
  },
};

/* ---------------- 活动 / 资讯 ---------------- */
const eventRepo = {
  list() {
    return db
      .prepare(
        `SELECT e.*, (SELECT COUNT(*) FROM enrollment en WHERE en.event_id = e.id) AS signup_count
         FROM event e ORDER BY e.event_date DESC`
      )
      .all();
  },
  /** 某用户已报名的活动 ID 集合 */
  signedEventIds(userId) {
    return db
      .prepare('SELECT event_id FROM enrollment WHERE user_id = ?')
      .all(userId)
      .map((r) => r.event_id);
  },
  findById(id) {
    return db.prepare('SELECT * FROM event WHERE id = ?').get(id);
  },
  signup(row) {
    db.prepare(
      `INSERT INTO enrollment (id, user_id, event_id, real_name, phone, notes)
       VALUES (@id, @user_id, @event_id, @real_name, @phone, @notes)`
    ).run(row);
    return db.prepare('SELECT * FROM enrollment WHERE id = ?').get(row.id);
  },
  mySignups(userId) {
    return db
      .prepare(
        `SELECT e.*, ev.title, ev.event_date, ev.location FROM enrollment e
         JOIN event ev ON ev.id = e.event_id WHERE e.user_id = ? ORDER BY e.created_at DESC`
      )
      .all(userId);
  },
};

const newsRepo = {
  list({ limit, offset }) {
    const total = db.prepare('SELECT COUNT(*) AS n FROM news').get().n;
    const list = db.prepare('SELECT * FROM news ORDER BY news_date DESC LIMIT ? OFFSET ?').all(limit, offset);
    return { list, total };
  },
};

const achievementRepo = {
  listAll() {
    return db.prepare('SELECT * FROM achievement').all();
  },
  listByUser(userId) {
    return db
      .prepare(
        `SELECT a.*, ua.unlocked_at FROM user_achievement ua
         JOIN achievement a ON a.key_ = ua.achievement_key WHERE ua.user_id = ?`
      )
      .all(userId);
  },
  unlock(userId, key) {
    const r = db.prepare('INSERT OR IGNORE INTO user_achievement (user_id, achievement_key) VALUES (?, ?)').run(userId, key);
    return r.changes > 0;
  },
};

module.exports = {
  categoryRepo,
  heritageRepo,
  inheritorRepo,
  materialRepo,
  eventRepo,
  newsRepo,
  achievementRepo,
};
