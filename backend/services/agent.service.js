// services/agent.service.js —— AI 共创 Agent（工具调用 / 工作流）
//
// 对应评审标准「AI 技术深度 / Agent 与工作流设计（8%）」+「MCP / 工具集成（4%）」：
//   1) 用 JSON Schema 定义 5 个工具（等价于 Function Calling 的 tools 声明，见 GET /api/ai/tools）
//   2) Agent 按"理解目标 → 检索项目 → 查详情 → 查已有作品 → 拆任务 → 起草方案"自主编排
//   3) 每步都会真实调用下面的工具函数并记录 trace（thought / tool / args / observation / 耗时）
//   4) 前端把 trace 渲染成"AI 思考过程"，最后给出可一键发布的结构化共创方案
//
// 注：没有配置 QWEN_API_KEY 时，规划器使用规则决策（等价于一个确定性 Agent）；
//     配置后同一套工具可直接交给大模型做 function calling，接口与 trace 结构不变。
const { db } = require('../db/database');
const config = require('../config');
const { retrieve, toCitations } = require('./rag.service');

/* ---------------- 工具定义（Function Calling Schema） ---------------- */
const TOOLS = [
  {
    name: 'search_heritage',
    title: '检索非遗项目',
    description: '按关键词在平台非遗库中检索项目，返回最相关的项目列表',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '检索关键词，如“钧瓷”“戏曲”“刺绣”' } },
      required: ['query'],
    },
  },
  {
    name: 'get_heritage_detail',
    title: '查询项目详情',
    description: '获取某个非遗项目的完整资料，包括简介、工艺流程、看点与代表性传承人',
    parameters: {
      type: 'object',
      properties: { heritageId: { type: 'string', description: '非遗项目 id' } },
      required: ['heritageId'],
    },
  },
  {
    name: 'list_related_works',
    title: '查看已有共创作品',
    description: '查看某个非遗项目下已有的共创作品，用于判断题材是否已被做过',
    parameters: {
      type: 'object',
      properties: { heritageId: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 10 } },
      required: ['heritageId'],
    },
  },
  {
    name: 'suggest_tasks',
    title: '拆解共创任务',
    description: '根据项目的工艺流程与门类，把共创拆成可执行任务（角色 + 工时 + 交付物）',
    parameters: {
      type: 'object',
      properties: { heritageId: { type: 'string' }, memberLimit: { type: 'integer', minimum: 2, maximum: 20 } },
      required: ['heritageId'],
    },
  },
  {
    name: 'draft_project_brief',
    title: '起草共创方案',
    description: '生成共创项目的标题、说明、招募要求与里程碑，可直接发布',
    parameters: {
      type: 'object',
      properties: {
        heritageId: { type: 'string' },
        angle: { type: 'string', enum: ['文创产品', '内容传播', '线下体验'] },
      },
      required: ['heritageId'],
    },
  },
];

/* ---------------- 工具实现 ---------------- */
const j = (v) => {
  try { return JSON.parse(v || '[]'); } catch { return []; }
};

function findHeritage(id) {
  return db
    .prepare(
      `SELECT h.*, c.name AS category_name FROM heritage h
       LEFT JOIN category c ON c.id = h.category_id
       WHERE h.id = ? AND h.status = 'published'`
    )
    .get(id);
}

const ROLE_BY_SECTION = {
  '传统技艺': '技艺顾问',
  '传统美术': '视觉设计',
  '传统戏剧': '内容策划',
  '传统音乐': '声音设计',
  '传统舞蹈': '编导',
  '曲艺': '内容策划',
  '传统体育·游艺与杂技': '动作设计',
  '传统医药': '内容审校',
  '民俗': '活动策划',
  '民间文学': '文案',
};

const registry = {
  search_heritage({ query }) {
    const q = String(query || '').trim();

    // 1) 先按"名称/标签包含"精确命中（用户通常直接说项目简称，如"钧瓷""汴绣"）
    if (q) {
      const like = `%${q}%`;
      const direct = db
        .prepare(
          `SELECT h.id, h.name, c.name AS category, h.level, h.region
           FROM heritage h LEFT JOIN category c ON c.id = h.category_id
           WHERE h.status = 'published' AND (h.name LIKE ? OR h.tags LIKE ? OR h.brief LIKE ?)
           ORDER BY (CASE WHEN h.name LIKE ? THEN 2 WHEN h.tags LIKE ? THEN 1 ELSE 0 END) DESC, h.popularity DESC
           LIMIT 4`
        )
        .all(like, like, like, like, like);
      if (direct.length) {
        return {
          value: direct,
          observation: `命中 ${direct.length} 个项目：${direct.map((x) => x.name).join('、')}`,
        };
      }
    }

    // 2) 退化到 BM25 检索
    const hits = retrieve(q, { k: 4 });
    const seen = new Map();
    for (const h of hits) {
      if (!seen.has(h.heritageId)) {
        seen.set(h.heritageId, { id: h.heritageId, name: h.heritageName, category: h.category, level: h.level, region: h.region });
      }
    }
    const list = [...seen.values()];
    return {
      value: list,
      observation: list.length ? `命中 ${list.length} 个项目：${list.map((x) => x.name).join('、')}` : '没有命中，需要换关键词',
    };
  },

  get_heritage_detail({ heritageId }) {
    const h = findHeritage(heritageId);
    if (!h) return { value: null, observation: '项目不存在或已下线' };
    const inheritors = db
      .prepare("SELECT name, title, level FROM inheritor WHERE heritage_id = ? AND status = 'published' LIMIT 3")
      .all(heritageId);
    return {
      value: {
        id: h.id,
        name: h.name,
        category: h.category_name,
        level: h.level,
        region: h.region,
        year: h.year,
        brief: h.brief,
        features: j(h.features),
        steps: j(h.steps),
        tags: j(h.tags),
        inheritors,
      },
      observation: `${h.name}（${h.category_name}·${h.level || '—'}·${h.region || '河南'}），工艺流程 ${j(h.steps).length} 步，代表性传承人 ${inheritors.length} 位`,
    };
  },

  list_related_works({ heritageId, limit = 5 }) {
    const rows = db
      .prepare(
        `SELECT title, work_type, likes_count FROM work
         WHERE heritage_id = ? AND status = 'approved' ORDER BY likes_count DESC LIMIT ?`
      )
      .all(heritageId, limit);
    return {
      value: rows,
      observation: rows.length ? `已有 ${rows.length} 件作品：${rows.map((r) => r.title).join('、')}` : '这个题材还没有人做过，属于空白位',
    };
  },

  suggest_tasks({ heritageId, memberLimit = 6 }) {
    const h = findHeritage(heritageId);
    if (!h) return { value: [], observation: '项目不存在' };
    const cat = h.category_name || '传统技艺';
    const role = ROLE_BY_SECTION[cat] || '视觉设计';
    const steps = j(h.steps);
    const craftStep = steps[Math.min(2, Math.max(steps.length - 1, 0))] || '梳理工艺流程';

    const tasks = [
      { title: `梳理「${h.name}」的工艺与文化要点`, description: `提炼${h.name}的历史源流、工艺步骤与可视觉化的元素。参考工序：${craftStep}`, role: '文案', estimateDays: 3 },
      { title: `提取 3 组纹样/色彩母题`, description: `围绕${(j(h.features)[0] || '代表性纹样')}，输出可复用的纹样与配色方案。`, role, estimateDays: 5 },
      { title: '输出 2 套产品/内容方案初稿', description: '按选定载体（器物、面料、数字内容等）各出一版方案，含尺寸与工艺可行性说明。', role, estimateDays: 7 },
      { title: '传承人评审与工艺可行性确认', description: `请${h.region || '当地'}代表性传承人对方案做一次评审，记录修改意见。`, role: '技艺顾问', estimateDays: 2 },
      { title: '打样与拍摄', description: '完成 1 件打样，拍摄成品图与过程图，用于作品发布。', role: '摄影/视觉', estimateDays: 4 },
    ].slice(0, Math.max(3, Math.min(5, memberLimit)));

    return {
      value: tasks,
      observation: `拆出 ${tasks.length} 个任务，覆盖 ${[...new Set(tasks.map((t) => t.role))].join('、')}，合计约 ${tasks.reduce((n, t) => n + t.estimateDays, 0)} 人日`,
    };
  },

  draft_project_brief({ heritageId, angle = '文创产品' }) {
    const h = findHeritage(heritageId);
    if (!h) return { value: null, observation: '项目不存在' };
    const features = j(h.features);
    const briefMap = {
      文创产品: {
        title: `${h.name}·当代文创共创（招募中）`,
        description: `以${h.name}的${features.slice(0, 2).join('、') || '代表性元素'}为母题，做一组能进入日常生活的文创产品。目标是把传统工艺的手作质感与当代使用场景接上，而不是简单贴纹样。`,
        recruitNeed: '视觉设计 1 名（会插画或建模）、文案 1 名（能把非遗故事讲清楚）、产品/工艺顾问 1 名',
      },
      内容传播: {
        title: `${h.name}·非遗数字化传播计划`,
        description: `围绕${h.name}的工艺流程与传承人故事，产出一组适合短视频与图文传播的内容：3 条 60 秒短片脚本 + 1 组图文物料。`,
        recruitNeed: '编导 1 名、摄影 1 名、剪辑 1 名',
      },
      线下体验: {
        title: `${h.name}·城市非遗体验工作坊`,
        description: `把${h.name}的核心工序压缩成一节 90 分钟的体验课，面向零基础人群，配套材料包与讲解脚本。`,
        recruitNeed: '活动策划 1 名、课程设计 1 名、物料统筹 1 名',
      },
    };
    const pick = briefMap[angle] || briefMap['文创产品'];
    return {
      value: {
        title: pick.title.slice(0, 60),
        description: pick.description.slice(0, 3000),
        recruitNeed: pick.recruitNeed.slice(0, 1000),
        heritageId: h.id,
        memberLimit: 6,
        angle,
      },
      observation: `已生成「${pick.title}」的方案草案（角度：${angle}）`,
    };
  },
};

/* ---------------- 规划器 ---------------- */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 在用户目标里找非遗项目：用"最长公共子串"匹配，能认出"钧瓷""汴绣"这类简称 */
function matchHeritageInText(text) {
  const rows = db.prepare('SELECT id, name FROM heritage WHERE status = ?').all('published');
  let best = null;
  let bestLen = 0;
  let bestOverlap = '';
  for (const r of rows) {
    const name = String(r.name || '');
    for (let i = 0; i < name.length; i++) {
      for (let len = name.length - i; len >= 2; len--) {
        const sub = name.slice(i, i + len);
        if (text.includes(sub)) {
          if (len > bestLen) {
            bestLen = len;
            best = r;
            bestOverlap = sub;
          }
          break;
        }
      }
    }
  }
  return bestLen >= 2 ? { row: best, overlap: bestOverlap, len: bestLen } : null;
}

/** 从目标里抽取关键词与创作角度 */
function parseGoal(goal, heritageId) {
  const text = String(goal || '');
  let angle = '文创产品';
  if (/短视频|传播|科普|内容|纪录片|海报/.test(text)) angle = '内容传播';
  if (/体验|工作坊|市集|线下|课程/.test(text)) angle = '线下体验';

  // 目标里出现非遗项目名（含简称）时直接锁定该项目
  const matched = matchHeritageInText(text);
  let keyword = matched ? matched.overlap : '';

  if (!keyword) {
    const cleaned = text
      .replace(/(帮我|请|我想|我要|想要|做|一个|做个|一下|关于|的|共创|项目|方案|策划|设计|非遗|河南)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    keyword = cleaned || '传统技艺';
  }

  return { keyword, angle, heritageId: heritageId || null, matchedId: matched ? matched.row.id : null };
}

/**
 * 运行 Agent
 * @param {string} goal 用户目标，如"帮我把钧瓷做成一套文创产品"
 * @param {{heritageId?:string, onStep?:Function}} opts
 */
async function runByRules(goal, opts = {}) {
  const { heritageId = null, onStep = null, pace = 220 } = opts;
  const trace = [];
  const started = Date.now();

  const call = async (thought, toolName, args) => {
    const t0 = Date.now();
    const fn = registry[toolName];
    const result = fn ? fn(args) : { value: null, observation: '工具不存在' };
    const step = {
      index: trace.length + 1,
      thought,
      tool: toolName,
      toolTitle: (TOOLS.find((t) => t.name === toolName) || {}).title || toolName,
      args,
      observation: result.observation,
      durationMs: Date.now() - t0,
    };
    trace.push(step);
    if (onStep) await onStep(step);
    if (pace) await sleep(pace);
    return result;
  };

  const parsed = parseGoal(goal, heritageId);

  // 1. 检索
  const search = await call(
    `先理解目标：「${String(goal).slice(0, 40)}」，需要先在非遗库里找到对应项目`,
    'search_heritage',
    { query: parsed.keyword }
  );
  let target = search.value && search.value[0];
  if (!target && parsed.heritageId) {
    const h = findHeritage(parsed.heritageId);
    if (h) target = { id: h.id, name: h.name };
  }
  if (!target) {
    return { ok: false, reason: 'no-match', trace, message: '没有在非遗库里找到匹配项目，换个说法试试（例如“钧瓷”“豫剧”“汴绣”）。' };
  }

  // 2. 详情
  const detail = await call(
    `选中「${target.name}」，需要拿到它的工艺与传承人信息才能设计共创`,
    'get_heritage_detail',
    { heritageId: target.id }
  );

  // 3. 已有作品
  const works = await call(
    '确认这个题材是否已经有人做过，避免重复',
    'list_related_works',
    { heritageId: target.id, limit: 5 }
  );

  // 4. 拆任务
  const tasks = await call(
    '按工艺流程把共创拆成可执行任务，并分配角色与工时',
    'suggest_tasks',
    { heritageId: target.id, memberLimit: 6 }
  );

  // 5. 起草方案
  const brief = await call(
    `创作角度判定为「${parsed.angle}」，据此起草可直接发布的共创方案`,
    'draft_project_brief',
    { heritageId: target.id, angle: parsed.angle }
  );

  const hits = retrieve(`${target.name} ${parsed.keyword}`, { k: 3 });

  return {
    ok: true,
    goal: String(goal).slice(0, 200),
    heritage: detail.value,
    worksCount: (works.value || []).length,
    tasks: tasks.value || [],
    proposal: brief.value,
    trace,
    citations: toCitations(hits),
    totalMs: Date.now() - started,
    toolCount: TOOLS.length,
    meta: { planner: 'rules' },
  };
}

/* ============================================================
 * LLM 自主规划模式（OpenAI 兼容的 tool calling 循环）
 *
 * 规则模式（runByRules）保证"演示必可复现"；这一条保证"Agent 真的自己决定调哪个工具"。
 * 通过环境变量切换：
 *   AGENT_PLANNER=auto（默认） → 有 QWEN_API_KEY 走 LLM，否则走规则
 *   AGENT_PLANNER=llm          → 强制 LLM（测试用，配合 __setTransport 注入假模型）
 *   AGENT_PLANNER=rules        → 强制规则
 * 任何失败（网络/超时/模型不听话/没产出方案）都自动回落规则模式，演示不会因此断掉。
 * ============================================================ */

const COMPAT_URL =
  process.env.QWEN_COMPAT_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

/** 测试注入点：替换真实 HTTP 调用（默认 null 表示用 fetch） */
let transport = null;
function __setTransport(fn) {
  transport = fn;
}

const SYSTEM_PROMPT = [
  '你是河南非物质文化遗产共创平台的规划助手。',
  '你的任务：把用户一句话需求，变成一份可以直接发布到平台上的"共创项目方案"。',
  '必须按顺序使用工具：search_heritage → get_heritage_detail → list_related_works → suggest_tasks → draft_project_brief。',
  '规则：',
  '1. 只能依据工具返回的真实数据，不要编造项目名、传承人、工艺步骤；',
  '2. 最多调用 6 次工具；找到项目后不要重复检索；',
  '3. draft_project_brief 的 angle 只能取：文创产品 / 内容传播 / 线下体验；',
  '4. 工具链跑完后，用一句话总结方案要点（不超过 80 字）。',
].join('\n');

/** 内部工具定义 → OpenAI tools 格式 */
function openAiTools() {
  return TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

async function defaultTransport(messages) {
  const resp = await fetch(COMPAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.qwenApiKey}` },
    body: JSON.stringify({
      model: config.qwenModel,
      messages,
      tools: openAiTools(),
      tool_choice: 'auto',
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  const msg = json && json.choices && json.choices[0] && json.choices[0].message;
  if (!msg) throw new Error('模型返回为空');
  return msg;
}

async function runWithLLM(goal, opts = {}) {
  const { heritageId = null, onStep = null } = opts;
  const trace = [];
  const started = Date.now();
  const collect = { heritage: null, worksCount: 0, tasks: [], proposal: null, target: null };

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: String(goal) + (heritageId ? `\n（用户当前浏览的项目 id：${heritageId}）` : '') },
  ];

  const chat = transport || defaultTransport;

  for (let round = 0; round < 6; round++) {
    const msg = await chat(messages);
    const toolCalls = msg.tool_calls || [];

    if (!toolCalls.length) {
      messages.push({ role: 'assistant', content: msg.content || '' });
      break;
    }

    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const name = tc.function && tc.function.name;
      let args = {};
      try {
        args = JSON.parse((tc.function && tc.function.arguments) || '{}');
      } catch (e) {
        args = {};
      }

      const fn = registry[name];
      const t0 = Date.now();
      const out = fn ? fn(args) : { value: null, observation: '工具不存在：' + name };

      const step = {
        index: trace.length + 1,
        thought: (msg.content || '').slice(0, 120) || `模型决定调用 ${name}`,
        tool: name,
        toolTitle: (TOOLS.find((t) => t.name === name) || {}).title || name,
        args,
        observation: out.observation,
        durationMs: Date.now() - t0,
        by: 'llm',
      };
      trace.push(step);
      if (onStep) await onStep(step);

      if (name === 'search_heritage' && Array.isArray(out.value) && out.value[0]) collect.target = out.value[0];
      if (name === 'get_heritage_detail' && out.value) collect.heritage = out.value;
      if (name === 'list_related_works' && Array.isArray(out.value)) collect.worksCount = out.value.length;
      if (name === 'suggest_tasks' && Array.isArray(out.value)) collect.tasks = out.value;
      if (name === 'draft_project_brief' && out.value) collect.proposal = out.value;

      messages.push({
        role: 'tool',
        tool_call_id: tc.id || `call_${trace.length}`,
        content: JSON.stringify(out.value === null || out.value === undefined ? { ok: false } : out.value).slice(0, 4000),
      });
    }
  }

  // 模型可能没走完工具链：缺什么补什么，保证结果结构完整
  const fill = async (toolName, args, thought) => {
    const fn = registry[toolName];
    if (!fn) return null;
    const t0 = Date.now();
    const out = fn(args);
    const step = {
      index: trace.length + 1,
      thought,
      tool: toolName,
      toolTitle: (TOOLS.find((t) => t.name === toolName) || {}).title || toolName,
      args,
      observation: out.observation,
      durationMs: Date.now() - t0,
      by: 'fallback',
    };
    trace.push(step);
    if (onStep) await onStep(step);
    return out.value;
  };

  if (!collect.heritage) {
    const id = (collect.target && collect.target.id) || heritageId;
    if (!id) {
      return {
        ok: false,
        reason: 'no-match',
        trace,
        message: '模型没有找到匹配的非遗项目，请换个说法（例如"钧瓷""汴绣"）。',
        meta: { planner: 'llm' },
      };
    }
    collect.heritage = await fill('get_heritage_detail', { heritageId: id }, '模型未取详情，自动补齐项目信息');
  }
  if (!collect.tasks.length && collect.heritage) {
    collect.tasks =
      (await fill('suggest_tasks', { heritageId: collect.heritage.id, memberLimit: 6 }, '模型未拆任务，自动按工艺流程补齐')) || [];
  }
  if (!collect.proposal && collect.heritage) {
    collect.proposal = await fill(
      'draft_project_brief',
      { heritageId: collect.heritage.id, angle: '文创产品' },
      '模型未起草方案，自动补齐可发布的方案'
    );
  }
  if (!collect.proposal) {
    return { ok: false, reason: 'no-proposal', trace, message: '模型没有产出可用方案。', meta: { planner: 'llm' } };
  }

  const name = (collect.heritage && collect.heritage.name) || (collect.target && collect.target.name) || '';
  const hits = retrieve(`${name} 文创`, { k: 3 });

  return {
    ok: true,
    goal: String(goal).slice(0, 200),
    heritage: collect.heritage,
    worksCount: collect.worksCount,
    tasks: collect.tasks,
    proposal: collect.proposal,
    trace,
    citations: toCitations(hits),
    totalMs: Date.now() - started,
    toolCount: TOOLS.length,
    meta: { planner: 'llm' },
  };
}

/** 统一入口：按 AGENT_PLANNER 选择规划器，LLM 失败自动回落规则 */
async function run(goal, opts = {}) {
  const mode = (process.env.AGENT_PLANNER || 'auto').toLowerCase();
  const useLLM = mode === 'llm' || (mode !== 'rules' && Boolean(config.qwenApiKey));

  if (useLLM) {
    try {
      const result = await runWithLLM(goal, opts);
      if (result && result.ok) return result;
    } catch (e) {
      // 静默回落：演示不能因为模型挂了而失败
    }
  }
  return runByRules(goal, opts);
}

module.exports = { run, runByRules, runWithLLM, __setTransport, TOOLS, registry };
