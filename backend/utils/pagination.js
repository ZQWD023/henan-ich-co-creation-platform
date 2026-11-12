// utils/pagination.js —— 分页参数解析
const config = require('../config');

/**
 * 从 query 里解析分页参数，永远返回合法值
 * 支持 ?page=1&pageSize=20 与 ?limit=20&offset=40 两种写法
 */
function parsePage(query = {}) {
  let page = Number(query.page || 1);
  let pageSize = Number(query.pageSize || query.limit || config.defaultPageSize);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = config.defaultPageSize;
  if (pageSize > config.maxPageSize) pageSize = config.maxPageSize;

  // 兼容 offset 写法
  if (query.offset !== undefined) {
    const offset = Math.max(0, Number(query.offset) || 0);
    page = Math.floor(offset / pageSize) + 1;
  }

  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}

/** 生成 SQL 片段：ORDER BY 白名单，防止注入 */
function parseSort(sort, allowed, fallback) {
  if (!sort) return fallback;
  const desc = String(sort).startsWith('-');
  const field = String(sort).replace(/^-/, '');
  if (!allowed.includes(field)) return fallback;
  return `${field} ${desc ? 'DESC' : 'ASC'}`;
}

module.exports = { parsePage, parseSort };
