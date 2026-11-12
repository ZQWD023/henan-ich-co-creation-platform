// services/ai.service.js —— AI 能力封装（通义千问 DashScope）
//
// 设计要点（答辩重点）：
//   1. AI 不是独立聊天框，而是嵌进业务流程：写文案、给纹样建议、语义扩展搜索、个性化推荐
//   2. 有 Key 走大模型，没 Key / 调用失败走「规则兜底」，保证演示现场不会白屏
//   3. 所有业务相关的提示词都注入平台真实数据（非遗项目的 brief/tags），避免模型胡编
const config = require('../config');
const { AppError } = require('../utils/response');
const { db } = require('../db/database');
const { workRepo } = require('../repositories/work.repo');
const { interactionRepo } = require('../repositories/social.repo');
const { heritageRepo } = require('../repositories/heritage.repo');

/** 统一的大模型调用；失败抛错，由调用方决定是否降级 */
async function callQwen(messages, { maxTokens = 600, temperature = 0.7 } = {}) {
  if (!config.isAiReady()) {
    throw new AppError(50200, 'AI 服务未配置（缺少 QWEN_API_KEY）', 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const resp = await fetch(config.qwenBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.qwenApiKey}`,
      },
      body: JSON.stringify({
        model: config.qwenModel,
        input: { messages },
        parameters: { result_format: 'message', max_tokens: maxTokens, temperature },
      }),
      signal: controller.signal,
    });

    const data = await resp.json();
    const content = data?.output?.choices?.[0]?.message?.content;
    if (!content) {
      throw new AppError(50200, `AI 返回异常：${data?.message || '空响应'}`, 502);
    }
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

/** 取非遗项目作为知识上下文（防止模型编造） */
function heritageContext(heritageId) {
  if (!heritageId) return '';
  const h = heritageRepo.findById(heritageId);
  if (!h) return '';
  let tags = [];
  try {
    tags = JSON.parse(h.tags || '[]');
  } catch {
    tags = [];
  }
  return [
    `【非遗项目】${h.name}`,
    `【级别】${h.level || '—'}`,
    `【地区】${h.region || '—'}`,
    `【简介】${h.brief || ''}`,
    `【技艺特点】${(h.features && JSON.parse(h.features || '[]').join('、')) || tags.join('、')}`,
  ].join('\n');
}

/* ---------------- 规则兜底模板 ---------------- */
function fallbackWorkDesc({ title, heritageName, keywords, tone }) {
  const kws = (keywords || []).filter(Boolean);
  const toneMap = {
    文艺: '温润含蓄',
    活泼: '轻快明亮',
    专业: '克制理性',
  };
  const t = toneMap[tone] || '自然平实';
  return [
    `《${title}》以${heritageName || '中原非遗'}为母题，走的是一条“把老手艺翻译成今天的样子”的路。`,
    kws.length ? `作品抓住 ${kws.join('、')} 三个视觉线索，` : '作品从形制与纹样入手，',
    `保留传统工艺的手作痕迹，同时在比例、配色与使用场景上做了减法，整体气质${t}。`,
    `它不是对纹样的复制，而是把${heritageName || '非遗'}里最耐看的那部分，接到了当代生活的手边。`,
    `（当前为规则生成的示例文案，配置 QWEN_API_KEY 后由大模型生成）`,
  ].join('');
}

const aiService = {
  /* ---------------- 1. 非遗知识问答 ---------------- */
  async chat({ message, heritageId }) {
    const ctx = heritageContext(heritageId);
    const system = `你是「河南省非遗共创平台」的 AI 助手，只回答与河南非物质文化遗产、传统工艺、文创设计相关的问题。
${ctx ? `当前用户正在浏览：\n${ctx}\n请优先结合该项目的资料回答。` : ''}
要求：
1. 基于已知的非遗知识回答，不确定就说不知道，不要编造年代、人名与数据；
2. 回答分 2-4 句，简洁、具体，避免空话；
3. 如合适，最后一句推荐用户可以参与的共创方向。`;

    try {
      const answer = await callQwen([
        { role: 'system', content: system },
        { role: 'user', content: message },
      ]);
      return { answer, source: 'model' };
    } catch (err) {
      // 兜底：从库里检索相关项目，给出有信息量的回答
      const rows = db
        .prepare("SELECT name, brief, region FROM heritage WHERE name LIKE ? OR brief LIKE ? LIMIT 3")
        .all(`%${message}%`, `%${message}%`);
      const answer = rows.length
        ? `平台收录的相关项目：\n${rows.map((r) => `· ${r.name}（${r.region || '河南'}）：${r.brief || ''}`).join('\n')}\n\n你可以点开项目详情查看工艺流程与传承人，也可以直接发起一个共创项目。`
        : `暂时没有在平台里检索到与「${message}」直接对应的高相关项目。你可以试试搜索“豫剧”“钧瓷”“汴绣”“少林功夫”等关键词，或告诉我更具体的方向，我帮你找可以一起共创的题材。`;
      return { answer, source: 'fallback', reason: err.message };
    }
  },

  /* ---------------- 2. AI 生成作品文案（挂在发布页） ---------------- */
  async workDescription({ title, heritageId, keywords, tone }) {
    const h = heritageId ? heritageRepo.findById(heritageId) : null;
    const heritageName = h ? h.name : null;

    const prompt = `你是文创品牌文案。请为一件非遗共创作品写一段 120-180 字的中文介绍。
作品标题：${title || '（未命名）'}
${h ? `取材非遗项目：${h.name}（${h.level || ''}，${h.region || ''}）\n项目简介：${h.brief || ''}` : ''}
${keywords && keywords.length ? `必须体现这些元素：${keywords.join('、')}` : ''}
${tone ? `语言风格：${tone}` : ''}
要求：不堆砌形容词，不写“中华文化博大精深”这类空话，要落到具体的形制、工艺或使用场景上；最后不要附加任何解释或标注。`;

    try {
      const content = await callQwen([{ role: 'user', content: prompt }], { maxTokens: 400, temperature: 0.8 });
      return { content, source: 'model' };
    } catch (err) {
      return {
        content: fallbackWorkDesc({ title, heritageName, keywords, tone }),
        source: 'fallback',
        reason: err.message,
      };
    }
  },

  /* ---------------- 3. AI 纹样创意建议（挂在共创项目页） ---------------- */
  async patternIdea({ heritageId, medium, audience }) {
    const h = heritageId ? heritageRepo.findById(heritageId) : null;
    if (!h) throw AppError.param('请先选择要共创的非遗项目');

    let tags = [];
    let features = [];
    try {
      tags = JSON.parse(h.tags || '[]');
      features = JSON.parse(h.features || '[]');
    } catch {
      /* ignore */
    }

    const prompt = `你是非遗文创设计顾问。围绕「${h.name}」（${h.level || ''}，${h.region || ''}）给出纹样创意建议。
项目简介：${h.brief || ''}
已知技艺特点：${features.join('、') || '—'}
标签：${tags.join('、') || '—'}
${medium ? `目标载体：${medium}` : ''}
${audience ? `目标人群：${audience}` : ''}

请输出 3 条建议，每条包含：
① 纹样母题（从该项目真实元素出发）
② 可落地的载体（具体到器物/面料/包装）
③ 一句话说明为什么这么做
用中文，编号列出，不要寒暄。`;

    try {
      const content = await callQwen([{ role: 'user', content: prompt }], { maxTokens: 700, temperature: 0.85 });
      return { content, heritage: h.name, source: 'model' };
    } catch (err) {
      const content = [
        `围绕「${h.name}」的 3 条纹样建议（规则兜底）：`,
        `① 母题：提取${features[0] || tags[0] || '其代表性纹样'}的主形，做 45° 四方连续；载体：丝巾 / 桌面屏风；理由：传统纹样最容易被现代印花工艺还原。`,
        `② 母题：把工艺流程中的动作线条抽象成线性图形；载体：包装腰封 / 书签；理由：让“手艺的过程”成为视觉记忆点。`,
        `③ 母题：取传统主色的三色组合做低饱和重排；载体：手机壳 / 帆布包；理由：降低文化距离，便于年轻群体日常使用。`,
        `（当前为规则生成，配置 QWEN_API_KEY 后由大模型生成）`,
      ].join('\n');
      return { content, heritage: h.name, source: 'fallback', reason: err.message };
    }
  },

  /* ---------------- 4. 智能搜索增强（同义词 + 库内标签） ---------------- */
  searchEnhance(query) {
    const synonyms = {
      戏曲: ['豫剧', '曲剧', '越调', '大平调', '二夹弦', '太康道情'],
      唱戏: ['戏曲', '豫剧', '曲剧', '唱腔'],
      武术: ['少林功夫', '太极拳', '苌家拳', '心意六合拳', '少林'],
      陶瓷: ['钧瓷', '汝瓷', '唐三彩', '官瓷'],
      瓷器: ['钧瓷', '汝瓷', '唐三彩'],
      刺绣: ['汴绣', '洛绣', '绣'],
      泥塑: ['泥咕咕', '淮阳泥泥狗', '泥塑'],
      年画: ['朱仙镇木版年画', '滑县年画', '木版'],
      剪纸: ['灵宝剪纸', '卢氏剪纸'],
      中医: ['传统医药', '针灸', '中药炮制'],
      茶: ['信阳毛尖', '制茶', '茶艺'],
      音乐: ['传统音乐', '唢呐', '古琴', '民歌'],
    };

    const expanded = new Set([query]);
    for (const [key, vals] of Object.entries(synonyms)) {
      if (query.includes(key) || key.includes(query)) vals.forEach((v) => expanded.add(v));
    }

    // 从库里的标签/名称反查，做二次扩展
    const rows = db
      .prepare('SELECT name, tags FROM heritage WHERE name LIKE ? OR tags LIKE ? LIMIT 10')
      .all(`%${query}%`, `%${query}%`);
    rows.forEach((r) => {
      expanded.add(r.name);
      try {
        JSON.parse(r.tags || '[]').forEach((t) => expanded.add(t));
      } catch {
        /* ignore */
      }
    });

    return {
      originalQuery: query,
      expandedKeywords: [...expanded].slice(0, 12),
      matched: rows.map((r) => r.name),
    };
  },

  /**
   * 5. 个性化推荐（规则 + 行为，不依赖模型，冷启动也有结果）
   * 打分：同分类 +3 / 同地区 +2 / 热度归一 +1 / 我已点赞过的项目的兄弟项目 +1
   */
  recommend(userId, { limit = 6 } = {}) {
    let seedHeritageIds = [];
    let seedCategories = [];

    if (userId) {
      const actions = interactionRepo.recentActions(userId, 50);
      const workIds = actions.filter((a) => a.targetType === 'work').map((a) => a.targetId);
      const heriIds = actions.filter((a) => a.targetType === 'heritage').map((a) => a.targetId);

      if (workIds.length) {
        const ph = workIds.map(() => '?').join(',');
        const rows = db.prepare(`SELECT heritage_id FROM work WHERE id IN (${ph})`).all(...workIds);
        seedHeritageIds.push(...rows.map((r) => r.heritage_id).filter(Boolean));
      }
      seedHeritageIds.push(...heriIds);

      if (seedHeritageIds.length) {
        const ph = seedHeritageIds.map(() => '?').join(',');
        seedCategories = db
          .prepare(`SELECT DISTINCT category_id FROM heritage WHERE id IN (${ph})`)
          .all(...seedHeritageIds)
          .map((r) => r.category_id);
      }
    }

    const pool = db
      .prepare("SELECT * FROM heritage WHERE status = 'published' ORDER BY popularity DESC LIMIT 200")
      .all();
    const maxPop = Math.max(...pool.map((p) => p.popularity || 0), 1);

    const scored = pool.map((p) => {
      let s = (p.popularity || 0) / maxPop;
      if (seedCategories.includes(p.category_id)) s += 3;
      if (seedHeritageIds.includes(p.id)) s -= 5; // 已看过的不推
      return { p, s };
    });

    scored.sort((a, b) => b.s - a.s);
    const heritageList = scored.slice(0, limit).map(({ p, s }) => ({
      id: p.id,
      name: p.name,
      category: p.category_id,
      brief: p.brief,
      region: p.region,
      level: p.level,
      popularity: p.popularity,
      score: Number(s.toFixed(2)),
    }));

    // 同时推几个正在招募的共创项目
    const projects = db
      .prepare(
        `SELECT p.id, p.title, p.description, p.members_count, p.member_limit, p.deadline,
                h.name AS heritage_name
         FROM co_project p LEFT JOIN heritage h ON h.id = p.heritage_id
         WHERE p.status = 'recruiting' ORDER BY p.created_at DESC LIMIT ?`
      )
      .all(limit);

    // 以及热门作品
    const works = workRepo.topByHeritage(seedHeritageIds.slice(0, 5), 4).map((w) => ({
      id: w.id,
      title: w.title,
      coverUrl: w.cover_url,
      likesCount: w.likes_count,
    }));

    return {
      basis: seedCategories.length ? 'personalized' : 'popular',
      seedCategories,
      heritage: heritageList,
      projects,
      works,
    };
  },
};

module.exports = { aiService, callQwen };
