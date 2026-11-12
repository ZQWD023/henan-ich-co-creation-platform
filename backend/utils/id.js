// utils/id.js —— 业务主键生成（带前缀，便于日志与排错）
const crypto = require('crypto');

function genId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

/** 生成短随机串（用于文件名） */
function shortToken(len = 12) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

module.exports = { genId, shortToken };
