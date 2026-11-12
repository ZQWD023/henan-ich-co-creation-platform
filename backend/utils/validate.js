// utils/validate.js —— 零依赖参数校验
// 目的：把"手写 if 校验"从每个路由里抽出来，失败时统一抛 VALIDATION_ERROR
//
// 用法：
//   const { body } = validate(req, {
//     username: { required: true, type: 'string', min: 3, max: 20, label: '用户名' },
//     email:    { required: true, type: 'email', label: '邮箱' },
//     age:      { type: 'int', min: 0, max: 120 },
//   });
const { AppError } = require('./response');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^1[3-9]\d{9}$/;

function pickOne(raw, key, rule, errors) {
  const label = rule.label || key;
  let v = raw[key];

  const isEmpty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

  if (isEmpty) {
    if (rule.required) {
      errors[key] = `${label}不能为空`;
      return undefined;
    }
    if ('default' in rule) return rule.default;
    return undefined;
  }

  switch (rule.type) {
    case 'string':
      v = String(v).trim();
      break;
    case 'number':
    case 'int': {
      const n = Number(v);
      if (Number.isNaN(n)) {
        errors[key] = `${label}必须是数字`;
        return undefined;
      }
      v = rule.type === 'int' ? Math.trunc(n) : n;
      break;
    }
    case 'boolean':
      v = v === true || v === 'true' || v === 1 || v === '1';
      break;
    case 'array':
      if (typeof v === 'string') {
        try {
          v = JSON.parse(v);
        } catch {
          v = v.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }
      if (!Array.isArray(v)) {
        errors[key] = `${label}必须是数组`;
        return undefined;
      }
      break;
    case 'object':
      if (typeof v !== 'object' || Array.isArray(v)) {
        errors[key] = `${label}必须是对象`;
        return undefined;
      }
      break;
    case 'email':
      v = String(v).trim();
      if (!EMAIL_RE.test(v)) {
        errors[key] = `${label}格式不正确`;
        return undefined;
      }
      break;
    case 'phone':
      v = String(v).trim();
      if (!PHONE_RE.test(v)) {
        errors[key] = `${label}格式不正确`;
        return undefined;
      }
      break;
    case 'date':
    case 'datetime': {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        errors[key] = `${label}不是合法时间`;
        return undefined;
      }
      v = d.toISOString();
      break;
    }
    default:
      break;
  }

  // 枚举
  if (rule.enum && !rule.enum.includes(v)) {
    errors[key] = `${label}只能是：${rule.enum.join(' / ')}`;
    return undefined;
  }

  // 长度（字符串）/ 数量（数组）
  if (typeof v === 'string') {
    if (rule.min !== undefined && v.length < rule.min) errors[key] = `${label}至少 ${rule.min} 个字符`;
    if (rule.max !== undefined && v.length > rule.max) errors[key] = `${label}最多 ${rule.max} 个字符`;
  }
  if (typeof v === 'number') {
    if (rule.min !== undefined && v < rule.min) errors[key] = `${label}不能小于 ${rule.min}`;
    if (rule.max !== undefined && v > rule.max) errors[key] = `${label}不能大于 ${rule.max}`;
  }
  if (Array.isArray(v)) {
    if (rule.min !== undefined && v.length < rule.min) errors[key] = `${label}至少 ${rule.min} 项`;
    if (rule.max !== undefined && v.length > rule.max) errors[key] = `${label}最多 ${rule.max} 项`;
  }

  return errors[key] ? undefined : v;
}

/**
 * 校验并清洗请求数据
 * @returns {{ body: object, query: object }} 只包含规则里声明过的字段（白名单，防止脏字段入库）
 */
function validate(req, rules, source = 'body') {
  const raw = req[source] || {};
  const out = {};
  const errors = {};

  for (const [key, rule] of Object.entries(rules)) {
    const v = pickOne(raw, key, rule, errors);
    if (v !== undefined) out[key] = v;
  }

  if (Object.keys(errors).length > 0) {
    throw AppError.validation('参数校验失败', errors);
  }
  return out;
}

module.exports = { validate, EMAIL_RE, PHONE_RE };
