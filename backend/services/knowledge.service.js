// services/knowledge.service.js —— 本地非遗知识检索（没有大模型时的"兜底大脑"）
//
// 目标：即使没有配置 QWEN_API_KEY，甚至后端没起来，用户问"钧瓷的窑变""河南有哪些戏曲"
// 也能得到一个具体、有信息量的回答，而不是一句"暂时没检索到"。
//
// 做法：把问题里的关键词与库里的 项目名 / 标签 / 分类 / 地区 / 简介 做多级打分，
// 命中多个时按分数 + 热度排序，取前两条组织答案。
const { db } = require('../db/database');

// 口语词 → 十大分类（用户很少直接说"传统戏剧"）
const CATEGORY_HINTS = [
  { keys: ['戏曲', '唱戏', '剧种', '戏剧', '梆子', '唱腔', '戏台'], cat: '传统戏剧' },
  { keys: ['武术', '功夫', '拳法', '太极', '杂技', '游艺', '体育'], cat: '传统体育·游艺与杂技' },
  { keys: ['音乐', '乐器', '唢呐', '民歌', '曲牌', '吹打'], cat: '传统音乐' },
  { keys: ['舞蹈', '舞', '傩'], cat: '传统舞蹈' },
  { keys: ['曲艺', '说唱', '大鼓', '坠子', '评书', '三弦'], cat: '曲艺' },
  { keys: ['美术', '年画', '剪纸', '刺绣', '雕塑', '泥塑', '绘画'], cat: '传统美术' },
  { keys: ['技艺', '烧造', '瓷器', '陶瓷', '酿造', '手工', '工艺'], cat: '传统技艺' },
  { keys: ['医药', '中医', '正骨', '药材', '药'], cat: '传统医药' },
  { keys: ['民俗', '庙会', '祭祀', '节令', '书会', '祭典'], cat: '民俗' },
  { keys: ['传说', '神话', '故事', '文学', '歌谣'], cat: '民间文学' },
];

const STOP = ['什么', '怎么', '哪些', '哪个', '如何', '为什么', '有没有', '可以', '介绍', '一下', '请问', '河南', '非遗', '非物质', '文化遗产', '区别', '特点', '有什', '么是'];

let cache = null;

function loadRows() {
  if (cache) return cache;
  const rows = db
    .prepare(
      `SELECT h.id, h.name, h.category_id, h.level, h.region, h.year, h.brief, h.intro,
              h.tags, h.features, h.popularity, c.name AS category_name
       FROM heritage h LEFT JOIN category c ON c.id = h.category_id`
    )
    .all();

  const j = (v) => {
    try { return JSON.parse(v || '[]'); } catch { return []; }
  };

  cache = rows.map((r) => ({
    ...r,
    tags: j(r.tags),
    features: j(r.features),
    text: [r.name, r.category_name, r.level, r.region, r.brief, (r.intro || '').slice(0, 160), ...j(r.tags)].join(' '),
  }));
  return cache;
}

/** 从问题里提取候选关键词（中文按 2~4 字滑窗，去停用词） */
function keywords(question) {
  const q = String(question || '').replace(/[\s，。！？、,.!?：:；;"'（）()《》]+/g, ' ').trim();
  const out = new Set();
  const chunks = q.split(' ').filter(Boolean);
  for (const chunk of chunks) {
    if (!chunk) continue;
    if (chunk.length <= 4) out.add(chunk);
    for (let n = 2; n <= Math.min(4, chunk.length); n++) {
      for (let i = 0; i + n <= chunk.length; i++) out.add(chunk.slice(i, i + n));
    }
  }
  for (const s of STOP) out.delete(s);
  return [...out].filter((k) => k.length >= 2);
}

/** 给每个项目打分，返回按相关度排序的候选 */
function rank(question) {
  const q = String(question || '');
  const kws = keywords(question);
  const rows = loadRows();

  const scored = rows.map((r) => {
    let s = 0;
    // 项目名整体出现在问题里（钧瓷 / 豫剧 / 汴绣）
    if (r.name && q.includes(r.name)) s += 40;
    if (r.name && q.includes(r.name.replace(/（.*?）/g, ''))) s += 10;
    // 标签命中
    for (const t of r.tags) if (t && q.includes(t)) s += 14;
    // 分类名命中
    if (r.category_name && q.includes(r.category_name)) s += 10;
    // 地区命中（去掉"市"再比）
    if (r.region) {
      const city = r.region.split(/[·・]/)[0].replace(/市$/, '');
      if (city && q.includes(city)) s += 8;
    }
    // 关键词与项目文本的碎片匹配
    for (const k of kws) {
      if (r.name.includes(k)) s += 6;
      else if (r.tags.some((t) => t.includes(k))) s += 4;
      else if (r.category_name && r.category_name.includes(k)) s += 3;
      else if (r.text.includes(k)) s += 1.2;
    }
    // 轻微热度加权，避免并列时给出冷门项目
    s += Math.min((r.popularity || 0) / 100000, 0.8);
    return { row: r, score: s };
  });

  scored.sort((a, b) => b.score - a.score);
  return { scored, kws };
}

/** 命中"戏曲""武术"这类口语分类词时，按分类回答 */
function byCategoryHint(question) {
  const rows = loadRows();
  for (const hint of CATEGORY_HINTS) {
    if (!hint.keys.some((k) => question.includes(k))) continue;
    const list = rows.filter((r) => r.category_name === hint.cat);
    if (list.length) return { cat: hint.cat, list };
  }
  return null;
}

function describeProject(r) {
  const parts = [];
  parts.push(`【${r.name}】${r.level ? '（' + r.level + '）' : ''}`);
  const meta = [r.category_name, r.region, r.year ? r.year + ' 年入选' : null].filter(Boolean).join(' · ');
  if (meta) parts.push(meta);
  if (r.brief) parts.push(r.brief);
  const intro = (r.intro || '').split('。')[0];
  if (intro && intro !== r.brief) parts.push(intro + '。');
  if (r.features && r.features.length) parts.push('看点：' + r.features.slice(0, 3).join('、'));
  return parts.join('\n');
}

/**
 * 本地知识回答
 * @returns {{answer:string, matched:Array<{id:string,name:string}>, source:string}}
 */
function answerQuestion(question) {
  const q = String(question || '').trim();
  if (!q) {
    return { answer: '想问点什么？比如“什么是钧瓷的窑变”“河南有哪些戏曲”。', matched: [], source: 'local' };
  }

  const { scored, kws } = rank(q);
  const strong = scored.filter((s) => s.score >= 12);
  const categoryHit = byCategoryHint(q);

  // 1) 命中具体项目（分数够高）：讲这个项目
  if (strong.length) {
    const top = strong.slice(0, 2).map((s) => s.row);
    const answer = [
      describeProject(top[0]),
      top[1] ? `\n相关项目还有「${top[1].name}」：${top[1].brief || ''}` : '',
      '\n想深入看的话，可以打开项目详情查工艺流程与传承人，也可以直接用这个母题发起一个共创项目。',
    ].filter(Boolean).join('\n');
    return { answer, matched: top.map((r) => ({ id: r.id, name: r.name })), source: 'local' };
  }

  // 2) 命中口语分类（河南有哪些戏曲 / 推荐点武术）
  if (categoryHit) {
    const list = categoryHit.list
      .slice()
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 6);
    const answer = [
      `平台收录的「${categoryHit.cat}」共有 ${categoryHit.list.length} 项，其中比较有代表性的：`,
      ...list.map((r) => `· ${r.name}（${r.region || '河南'}）：${r.brief || ''}`),
      '\n点开任意一项可以看它的历史源流、工艺流程与代表性传承人。',
    ].join('\n');
    return { answer, matched: list.map((r) => ({ id: r.id, name: r.name })), source: 'local' };
  }

  // 3) 求推荐 / 想做文创：优先给"视觉元素强、能做成产品"的传统技艺与传统美术
  if (/推荐|适合|文创|设计|产品|伴手礼|礼物|周边/.test(q)) {
    const CRAFTY = ['传统技艺', '传统美术', '传统戏剧'];
    const picks = loadRows()
      .filter((r) => CRAFTY.includes(r.category_name))
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 5);
    const answer = [
      '如果是做文创，建议从"视觉符号明确、工艺能被转译"的项目入手，这几个最常被选中：',
      ...picks.map((r) => `· ${r.name}（${r.category_name}｜${r.region || '河南'}）：${r.brief || ''}`),
      '\n切入角度可以从三处找：一是纹样（把主形做成四方连续），二是色彩（取传统配色的三色组合），三是器形与工艺痕迹（保留手作的"不完美"）。选定母题后可以直接在「共创广场」发起一个项目，找设计伙伴一起落地。',
    ].join('\n');
    return { answer, matched: picks.slice(0, 2).map((r) => ({ id: r.id, name: r.name })), source: 'local' };
  }

  // 4) 泛问"河南非遗有哪些"
  if (/有哪些|有什么|介绍|概览|全部/.test(q) && kws.length <= 4) {
    const rows = loadRows().slice().sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 6);
    const answer = [
      '平台目前按国家级、省级等层级收录了 49 个河南非遗项目，覆盖传统戏剧、传统技艺、传统体育等十大分类。热度较高的有：',
      ...rows.map((r) => `· ${r.name}（${r.category_name}｜${r.region || '河南'}）`),
      '\n你可以按分类浏览，也可以告诉我一个具体方向（比如“想找能做文创的陶瓷类项目”）。',
    ].join('\n');
    return { answer, matched: rows.map((r) => ({ id: r.id, name: r.name })), source: 'local' };
  }

  // 5) 没命中：给方向
  const suggestions = scored.slice(0, 3).map((s) => `· ${s.row.name}：${s.row.brief || ''}`);
  return {
    answer: [
      `没有直接找到和「${q}」高度相关的内容。平台里可以试试这些方向：`,
      ...suggestions,
      '\n换个说法也可以，比如直接说项目名（豫剧 / 钧瓷 / 汴绣 / 少林功夫 / 太极拳），或者问我“某个分类里有哪些项目”。',
    ].join('\n'),
    matched: [],
    source: 'local',
  };
}

module.exports = { answerQuestion, rank, loadRows };
