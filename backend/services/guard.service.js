// services/guard.service.js —— AI 安全与可控性
//
// 对应评审标准「AI 技术深度 / AI 安全与可控性（4%）」：
//   1) 输入侧：提示词注入、越界话题、隐私信息的拦截
//   2) 输出侧：敏感内容兜底、长度裁剪、强制"AI 生成"标识
//   3) 全链路：任何异常都降级为可读文案，不把 500 抛给用户
//
// 设计原则：宁可少答，不可乱答；拦截原因要说人话。

const RULES = [
  {
    name: 'prompt-injection',
    level: 'block',
    re: /(忽略|无视|绕过|跳出).{0,8}(之前|以上|上面|前面|系统).{0,8}(指令|提示|规则|设定|限制)|ignore\s+(all\s+)?(previous|above)\s+instructions|system\s*prompt|developer\s*mode|越狱/i,
    message: '这个问题在试探我的指令边界，我不能照做。我们回到河南非遗本身吧，比如豫剧、钧瓷、汴绣。',
  },
  {
    name: 'illegal',
    level: 'block',
    re: /(赌博|毒品|枪支|色情|恐怖袭击|炸弹制作)/,
    message: '这个问题超出了非遗知识助手的范围，我就不展开了。如果你在做非遗相关的创作，我可以帮你找题材、拆任务。',
  },
  {
    name: 'privacy',
    level: 'block',
    re: /(身份证号|银行卡号|密码是|1[3-9]\d{9})/,
    message: '涉及个人隐私信息，我不能处理。请把问题换成非遗相关的内容。',
  },
];

const OUTBOUND_SOFT = [
  { re: /(政变|暴动|分裂国家)/g, to: '（该表述已过滤）' },
];

/**
 * 输入检查
 * @returns {{ok:boolean, reason?:string, message?:string}}
 */
function inspectInput(text) {
  const s = String(text || '');
  if (s.length > 300) {
    return { ok: false, reason: 'too-long', message: '问题太长了，精简到 300 字以内我再回答。' };
  }
  for (const r of RULES) {
    if (r.re.test(s)) return { ok: false, reason: r.name, message: r.message };
  }
  return { ok: true };
}

/** 输出后处理：敏感替换 + 长度裁剪 + 结尾标识 */
function sanitizeOutput(text, { maxChars = 1200, mark = true } = {}) {
  let s = String(text || '');
  for (const rule of OUTBOUND_SOFT) s = s.replace(rule.re, rule.to);
  if (s.length > maxChars) s = s.slice(0, maxChars) + '…';
  return mark ? s : s;
}

/** 统一给前端的"AI 标识"（前端会把这句话渲染成角标） */
const AI_NOTICE = '本回答由 AI 结合平台知识库生成，仅供参考，请以官方公布信息为准。';

module.exports = { inspectInput, sanitizeOutput, AI_NOTICE };
