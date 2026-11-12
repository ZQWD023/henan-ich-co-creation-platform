// services/heritage.service.js —— 内容库业务层
// 职责：把数据库行转成前端友好的结构（JSON 字符串解析、附加统计字段）
const { AppError } = require('../utils/response');
const { genId } = require('../utils/id');
const {
  categoryRepo,
  heritageRepo,
  inheritorRepo,
  materialRepo,
  eventRepo,
  newsRepo,
  achievementRepo,
} = require('../repositories/heritage.repo');

/** 安全解析 JSON 字段（库里存的是字符串） */
function parseJsonField(v, fallback = []) {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

/** 行 → 前端对象 */
function mapHeritage(row, { withDetail = false } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    name: row.name,
    category: row.category_id,
    categoryName: row.category_name || null,
    level: row.level,
    region: row.region,
    year: row.year,
    icon: row.icon,
    gradient: row.gradient,
    brief: row.brief,
    tags: parseJsonField(row.tags),
    popularity: row.popularity,
    likes: row.likes,
    coverUrl: row.cover_url,
    status: row.status,
    createdAt: row.created_at,
  };
  if (withDetail) {
    base.intro = row.intro;
    base.history = row.history;
    base.lineage = row.lineage;
    base.features = parseJsonField(row.features);
    base.steps = parseJsonField(row.steps);
    base.visit = row.visit;
  }
  return base;
}

const heritageService = {
  /* 分类 */
  listCategories() {
    const rows = categoryRepo.list();
    return rows.map((c) => ({ ...c, heritageCount: categoryRepo.countHeritage(c.id) }));
  },

  /* 列表 */
  listHeritage(query) {
    const sortMap = {
      popularity: 'h.popularity DESC',
      newest: 'h.year DESC, h.created_at DESC',
      likes: 'h.likes DESC',
      name: 'h.name ASC',
    };
    const sortBy = sortMap[query.sort] || sortMap.popularity;

    const { list, total } = heritageRepo.search({
      category: query.category,
      region: query.region,
      level: query.level,
      keyword: query.keyword,
      sortBy,
      limit: query.limit,
      offset: query.offset,
    });
    return { list: list.map((r) => mapHeritage(r)), total };
  },

  /* 详情（含传承人 + 相关共创作品 + 相关项目） */
  getHeritageDetail(id) {
    const row = heritageRepo.findById(id);
    if (!row || row.status !== 'published') throw AppError.notFound('非遗项目不存在或已下架');

    heritageRepo.incViews(id);

    const inheritors = inheritorRepo.findByHeritage(id).map((i) => ({
      id: i.id,
      name: i.name,
      gender: i.gender,
      level: i.level,
      title: i.title,
      region: i.region,
      years: i.years,
      bio: i.bio,
      icon: i.icon,
      avatarUrl: i.avatar_url,
    }));

    return {
      ...mapHeritage(row, { withDetail: true }),
      inheritors,
      // 同分类推荐（排除自己）
      related: heritageRepo
        .topByCategories([row.category_id], 4, [id])
        .map((r) => mapHeritage(r)),
    };
  },

  getRegions() {
    return heritageRepo.regions();
  },

  /* 传承人 */
  listInheritors(query) {
    const { list, total } = inheritorRepo.list(query);
    return {
      list: list.map((i) => ({
        id: i.id,
        name: i.name,
        gender: i.gender,
        level: i.level,
        heritageId: i.heritage_id,
        heritageName: i.heritage_name,
        title: i.title,
        region: i.region,
        years: i.years,
        bio: i.bio,
        icon: i.icon,
        avatarUrl: i.avatar_url,
      })),
      total,
    };
  },

  getInheritorDetail(id) {
    const i = inheritorRepo.findById(id);
    if (!i) throw AppError.notFound('传承人不存在');
    return {
      id: i.id,
      name: i.name,
      gender: i.gender,
      level: i.level,
      heritageId: i.heritage_id,
      title: i.title,
      region: i.region,
      years: i.years,
      bio: i.bio,
      icon: i.icon,
      avatarUrl: i.avatar_url,
      heritage: i.heritage_id ? mapHeritage(heritageRepo.findById(i.heritage_id)) : null,
    };
  },

  /* 素材库 */
  listMaterials(query) {
    const { list, total } = materialRepo.list(query);
    return {
      list: list.map((m) => ({
        id: m.id,
        title: m.title,
        type: m.type,
        heritageId: m.heritage_id,
        fileUrl: m.file_url,
        coverUrl: m.cover_url,
        sizeBytes: m.size_bytes,
        downloads: m.downloads,
        createdAt: m.created_at,
      })),
      total,
    };
  },

  createMaterial(userId, body) {
    const row = {
      id: genId('mat'),
      user_id: userId,
      heritage_id: body.heritageId || null,
      title: body.title,
      type: body.type || 'pattern',
      file_url: body.fileUrl,
      cover_url: body.coverUrl || null,
      size_bytes: body.sizeBytes || 0,
    };
    return materialRepo.create(row);
  },

  deleteMaterial(id, user) {
    const m = materialRepo.findById(id);
    if (!m) throw AppError.notFound('素材不存在');
    if (m.user_id !== user.id && user.role !== 'admin') throw AppError.forbidden('只能删除自己上传的素材');
    materialRepo.remove(id);
  },

  downloadMaterial(id) {
    const m = materialRepo.findById(id);
    if (!m) throw AppError.notFound('素材不存在');
    materialRepo.incDownloads(id);
    return { fileUrl: m.file_url, filename: m.title };
  },

  /* 活动 / 资讯 / 成就 */
  listEvents(userId) {
    const signed = userId ? new Set(eventRepo.signedEventIds(userId)) : new Set();
    return eventRepo.list().map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      date: e.event_date,
      location: e.location,
      status: e.status,
      desc: e.description,
      icon: e.icon,
      coverUrl: e.cover_url,
      signupCount: e.signup_count || 0,
      signed: signed.has(e.id),
    }));
  },

  signupEvent(userId, eventId, { realName, phone, notes }) {
    const ev = eventRepo.findById(eventId);
    if (!ev) throw AppError.notFound('活动不存在');
    return eventRepo.signup({
      id: genId('enr'),
      user_id: userId,
      event_id: eventId,
      real_name: realName,
      phone,
      notes: notes || null,
    });
  },

  mySignups(userId) {
    return eventRepo.mySignups(userId);
  },

  listNews(query) {
    return newsRepo.list(query);
  },

  listAchievements(userId) {
    const all = achievementRepo.listAll();
    if (!userId) return all.map((a) => ({ ...a, unlocked: false }));
    const mine = new Set(achievementRepo.listByUser(userId).map((a) => a.key_));
    return all.map((a) => ({ ...a, unlocked: mine.has(a.key_) }));
  },

  unlockAchievement(userId, key) {
    return achievementRepo.unlock(userId, key);
  },
};

module.exports = { heritageService, mapHeritage, parseJsonField };
