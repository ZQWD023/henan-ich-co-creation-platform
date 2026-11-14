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
const { answerQuestion } = require('./knowledge.service');
const { retrieve, buildContext, toCitations } = require('./rag.service');
const { inspectInput, sanitizeOutput, AI_NOTICE } = require('./guard.service');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 把一段完整回答切成小片，模拟 token 流式输出（本地兜底时用） */
function chunkForStream(text) {
  const sizes = [4, 7, 3, 6, 5, 8];
  const out = [];
  let i = 0;
  let k = 0;
  const s = String(text || '');
  while (i < s.length) {
    const n = sizes[k++ % sizes.length];
    out.push(s.slice(i, i + n));
    i += n;
  }
  return out;
}

/**
 * 通义千问流式调用（SSE）
 * 与 callQwen 的区别：边生成边 yield，前端可以逐字渲染
 */
async function* streamQwen(messages, { maxTokens = 600, temperature = 0.7 } = {}) {
  if (!config.isAiReady()) {
    throw new AppError(50200, 'AI 服务未配置（缺少 QWEN_API_KEY）', 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const resp = await fetch(config.qwenBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.qwenApiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: config.qwenModel,
        input: { messages },
        parameters: { result_format: 'message', incremental_output: true, max_tokens: maxTokens, temperature },
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const piece = json && json.output && json.output.choices && json.output.choices[0]
            && json.output.choices[0].message && json.output.choices[0].message.content;
          if (piece) yield piece;
        } catch (e) {
          /* 忽略非 JSON 的心跳行 */
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}


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
  /* ---------------- 1. 非遗知识问答（RAG 增强）---------------- */
  async chat({ message, heritageId }) {
    const ctx = heritageContext(heritageId);

    // RAG：先检索知识片段，再让模型"带着依据"回答
    const hits = retrieve(message, { k: 4, heritageId });
    const context = buildContext(hits);
    const citations = toCitations(hits);

    const system = `你是「河南省非遗共创平台」的 AI 助手，只回答与河南非物质文化遗产、传统工艺、文创设计相关的问题。
${ctx ? `当前用户正在浏览：\n${ctx}\n请优先结合该项目的资料回答。` : ''}
${context ? `以下是平台知识库检索到的资料，请优先依据它们回答，不要编造资料之外的事实：\n${context}` : ''}
要求：
1. 只依据上面资料与公共常识回答，资料里没有的信息明确说"平台资料里没有提到"；
2. 回答分 2-4 句，简洁、具体，避免空话；
3. 如合适，最后一句推荐用户可以参与的共创方向；
4. 不要输出"根据资料"这类元话术，直接回答。`;

    try {
      const answer = await callQwen([
        { role: 'system', content: system },
        { role: 'user', content: message },
      ]);
      return { answer, source: 'model', citations, notice: AI_NOTICE };
    } catch (err) {
      // 兜底：本地知识检索（项目名 / 标签 / 分类 / 地区多级打分），保证演示现场有问必答
      const kb = answerQuestion(message);
      return {
        answer: kb.answer,
        matched: kb.matched,
        source: 'fallback',
        citations,
        notice: AI_NOTICE,
        reason: err.message,
      };
    }
  },

  /**
   * 流式问答（SSE）：把"思考 → 检索 → 生成 → 标识"整个过程按事件推给前端，
   * 前端据此做流式渲染 + 思考状态可视化 + 引用依据展示。
   * 事件类型：thought | retrieval | delta | notice | done | blocked | error
   */
  async *chatStream({ message, heritageId }) {
    const t0 = Date.now();

    // 1) 安全闸门
    const guard = inspectInput(message);
    if (!guard.ok) {
      yield { type: 'thought', text: '输入检查未通过，已拦截' };
      yield { type: 'blocked', reason: guard.reason, message: guard.message };
      yield { type: 'done', source: 'guard', elapsedMs: Date.now() - t0 };
      return;
    }

    yield { type: 'thought', text: '理解问题：抽取关键词与意图' };

    // 2) 检索增强
    const hits = retrieve(message, { k: 4, heritageId });
    yield {
      type: 'retrieval',
      text: hits.length ? `知识库检索命中 ${hits.length} 个片段（BM25）` : '知识库没有命中相关片段，将基于通用知识回答',
      items: toCitations(hits),
    };

    let answer = '';
    let source = 'fallback';

    // 3) 有 Key 走大模型真流式；失败或不配置则走本地知识库
    if (config.isAiReady()) {
      try {
        yield { type: 'thought', text: '调用通义千问（流式）生成回答' };
        const ctx = heritageContext(heritageId);
        const context = buildContext(hits);
        const messages = [
          {
            role: 'system',
            content: `你是「河南省非遗共创平台」的 AI 助手，只回答河南非物质文化遗产相关问题。
${ctx ? `当前用户正在浏览：\n${ctx}` : ''}
${context ? `平台知识库检索到的资料：\n${context}` : ''}
要求：只依据资料与公共常识回答；资料没提到就说不知道；2-4 句，具体、不空话。`,
          },
          { role: 'user', content: message },
        ];
        for await (const delta of streamQwen(messages)) {
          answer += delta;
          yield { type: 'delta', text: delta };
        }
        if (!answer.trim()) throw new Error('模型返回为空');
        source = 'model';
      } catch (err) {
        answer = '';
        yield { type: 'thought', text: `大模型调用失败（${String(err.message).slice(0, 40)}），切换到平台知识库` };
      }
    } else {
      yield { type: 'thought', text: '未配置大模型，使用平台知识库生成（规则兜底）' };
    }

    // 4) 本地兜底：一样是"流式"吐出去，保证前端渲染路径完全一致
    if (!answer) {
      const kb = answerQuestion(message);
      answer = sanitizeOutput(kb.answer);
      source = 'fallback';
      for (const piece of chunkForStream(answer)) {
        yield { type: 'delta', text: piece };
        await sleep(26);
      }
    }

    // 5) 收尾：AI 标识 + 引用 + 计时
    yield { type: 'notice', text: AI_NOTICE };
    yield {
      type: 'done',
      source,
      elapsedMs: Date.now() - t0,
      citations: toCitations(hits),
      matched: hits[0] ? { id: hits[0].heritageId, name: hits[0].heritageName } : null,
    };
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
    const seedHeritageIds = [];
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
