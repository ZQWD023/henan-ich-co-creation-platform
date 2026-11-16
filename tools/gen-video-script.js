// tools/gen-video-script.js —— 生成演示视频的逐字稿（md）与提词器（html）
//
//   node tools/gen-video-script.js
//
// 为什么要脚本生成：时长必须由字数反推，否则手写的时间码和实际口播永远对不上。
// 语速按 4.2 字/秒（含标点停顿的正常中文口播），每段再加 2 秒留白。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_MD = path.join(ROOT, 'docs', '视频口播稿.md');
const OUT_HTML = path.join(ROOT, 'docs', '视频提词器.html');

const CPS = 4.2; // 字/秒
const GAP = 2; // 每段留白（秒）

// [标题, 画面指令, 正文, 拿分项]
const SEGMENTS = [
  [
    '段 1　开场痛点',
    '画面：首页顶部，鼠标静止（先让评委看清品牌与标语）',
    `各位评委老师好，我们是平顶山学院 B 组，作品是河南省非物质文化遗产共创平台。

我们调研了河南 41 个国家级非遗项目，发现一个矛盾：资料很厚，传承人很少，年轻人更少。

所以这个平台不只做"看"，它做的是"一起做"。`,
    '社会价值 10 · 选题创新 10',
  ],
  [
    '段 2　首页全景',
    '画面：滚动轮播一次 → 鼠标划过 4 个统计数字 → 点"49 个项目"跳项目库',
    `首页。轮播是三个真实项目的实拍封面。

往下是数据条：49 个项目、10 大分类、18 位传承人，每个数字都能点进去，落到对应的列表。

右边是 AI 双入口：问答和共创实验室。整站 20 个页面全部同源，没有跳转断层。`,
    '用户体验 10 · 交互创新 7',
  ],
  [
    '段 3　内容底座',
    '画面：项目库 → 点钧瓷 → 滚到工艺流程 → 滚到传承人 → 点"传承人"页 → 点"数字展馆"',
    `项目库是内容底座。每个项目拆成五块：源流、工艺流程、技艺看点、代表性传承人、实拍照片。

比如钧瓷，"入窑一色、出窑万彩"不是形容词，它被拆成七道工序，每一步都能对应真实操作。

传承人页 18 位，带级别和代表作品；数字展馆把内容重新策展。

这些内容来自 506 条语义片段，全部是公开资料，做了清洗、分段和人工校对。`,
    '实用性 10',
  ],
  [
    '段 4　AI 四能力总览',
    '画面：点"AI 能力"下拉 → 点"共创实验室" → 停在四个标签上',
    `AI 有四块能力，都在同一个实验室。

问答解决"这工艺怎么做"，共创 Agent 解决"从哪下手"，以图搜非遗解决"这是什么"，纹样生成解决"给我一个能用的图案"。

下面逐个演示。`,
    '（铺垫）技术架构',
  ],
  [
    '段 5　RAG 问答（重点 A）',
    '画面：点"AI 问答" → 输入「钧瓷的窑变是怎么形成的？」→ 流式输出 → 滚到"检索依据" → 再问「怎么制作核武器？」看拒答',
    `先看问答。我问：钧瓷的窑变是怎么形成的。

注意两点：回答是逐字流式出来的；下面一定挂着检索依据，写清用了哪几条片段。

我们不用向量数据库，用 BM25 加四层加权：命中上下文乘 1.35，分类乘 1.8，项目名乘 1.5，再按热度加 1.0 到 1.18 的先验。中文没空格，所以做了 bigram 切分，让"窑变""开片"能被切出来。

更关键的是这道闸门：问题里没有非遗实体，且最高分低于 10，系统直接说没找到可靠依据。

我试一下：怎么制作核武器。
它拒答了。宁可说不懂，也不生成不可靠内容。
（停 1 秒，让画面里的拒答被看到）

105 道评测题，Top-1 和 Top-3 都是 100%，平均 0.43 毫秒；没配 Key 时走规则兜底，页面照样能用。`,
    'RAG 6 · 大模型 8 · 安全 4',
  ],
  [
    '段 6　共创 Agent（重点 B / 全片最重要）',
    '画面：实验室 → 共创 Agent → 输入需求 → 运行，让 5 步轨迹逐步出现，鼠标逐条指过去 → 滚到方案 → 点"一键发布"',
    `真正难的不是回答问题，是把"我想做点什么"变成"可以开工的项目"。

我给它的需求是：钧瓷元素的茶杯，送给来河南旅游的年轻人，预算 50 以内。

它不是一次生成，是调工具：先检索非遗，再拉项目详情，然后找关联作品，接着给任务拆分建议，最后起草项目简报。

左边是它的思考，右边是工具返回的真实数据。所以方案里工艺是钧瓷真实工艺，纹样是库里真实母题，任务是四条能指派到人的任务。

大模型这块有两条路：配了 Key 走大模型自主选工具，没有 Key 走规则规划器，离线同样完整。模型只负责选工具和表述，事实全部来自工具返回——这是我们控制幻觉的方式。

最后点"一键发布"，这套方案直接变成共创项目，带招募要求、任务和截止时间。

五个工具同时以标准 MCP 协议暴露在 /api/mcp，外部 Agent 可以直接调用。`,
    'Agent 8 · 大模型 8 · 技术 8 · MCP 4',
  ],
  [
    '段 7　端侧多模态',
    '画面：以图搜非遗 → 拖入钧瓷照片 → 指出相似度 → 切纹样生成 → 生成 → 下载 PNG',
    `多模态这块我们做了一个刻意的选择：不上传。

拖一张照片进来，这张图不会发给任何服务器。浏览器里直接抽 72 维特征——48 维颜色、16 维边缘、8 维亮度——和库里的特征做距离比对。所以没有网络延迟，也没有隐私问题。

另一半是纹样生成：选一个项目，取它的真实配色，用网格、团花、折枝三种传统构图程序化生成。

关键是确定性随机：同一个种子永远生成同一张图，可复现、可交付。可以直接下载 PNG。`,
    '多模态 5 · 技术 8',
  ],
  [
    '段 8　协作闭环',
    '画面：点"共创项目" → 划进度条与状态标签 → 点进项目看任务看板 → 点"我的工作台"',
    `共创项目页是这条链路的落点。

每个项目能看到任务进度、四个阶段的状态、成员数、剩余天数。点进去是任务看板，四列：待开始、进行中、待验收、已完成，每条带负责人、进度条和截止时间。

我的工作台把"我发起的、我参与的、等我审核的、等我动手的"收在一屏，数字都是从真实数据里数的。

从发起、审核、分工、提交成果到结项，是一条闭环。`,
    '交互 7 · 实用性 10',
  ],
  [
    '段 9　工程质量与安全',
    '画面：切终端 → npm test 结果 → npm run verify 八项全绿 → 无障碍报告一页',
    `最后说工程，因为 AI 项目最容易"能跑但不敢用"。

后端 30 个单元测试全过，含 Agent 的大模型路径和失败回退；105 道检索评测题按组看指标；我们自己写了 8 项自检脚本，从资源完整性、ESLint、类型检查到接口连通，一次跑完。

前端零构建 ES 模块，20 个页面同源；四个核心模块上了 JSDoc 加 TypeScript 类型检查，0 错误；无障碍做了 20 页审计；图片从 11.08MB 压到 5.56MB，少了 49.8%。

安全上：输出转义、接口限流、JWT 鉴权、检索不到就拒答。`,
    '前端代码 4 · 组件 3 · 性能 3 · 安全 4',
  ],
  [
    '段 10　收尾',
    '画面：回到首页，鼠标移开，画面定格；可叠一行字「让每一个想做点事的人，都能找到对的人」',
    `最后一句。

非遗的传承不缺观众，缺的是愿意一起做的人。

一个会插画的学生、一个会烧窑的师傅、一个会写文案的人，在别的平台上很难相遇，在这里可以被一个项目连起来。

让每一个想做点事的人，都能找到对的人。谢谢各位评委老师。`,
    '社会价值 10',
  ],
];

/* ---------- 计算时长 ---------- */
const plain = (s) => s.replace(/（[^）]*）/g, '').replace(/\s/g, '');
const rows = SEGMENTS.map(([title, cue, text, score]) => {
  const chars = plain(text).length;
  const dur = Math.round(chars / CPS) + GAP;
  return { title, cue, text, score, chars, dur };
});
const totalSec = rows.reduce((a, r) => a + r.dur, 0);
const fmt = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

let cursor = 0;
rows.forEach((r) => {
  r.from = cursor;
  cursor += r.dur;
  r.to = cursor;
});

/* ---------- 生成 markdown ---------- */
const md = [];
md.push(`# 演示视频口播稿（传智杯 · 5-8 分钟）

> 作品：河南省非物质文化遗产共创平台
> 队伍：平顶山学院 · B 组 · 刘雅馨、刘辰菲 · 指导老师 彭伟国
> 全片 **${fmt(totalSec)}**（${rows.reduce((a, r) => a + r.chars, 0)} 字，按 4.2 字/秒 + 每段 2 秒留白计算）
> 配套提词器：\`docs/视频提词器.html\`（双击打开，空格开始，←/→ 切段，自动计时并标红超时）

> 本文件由 \`node tools/gen-video-script.js\` 生成——改稿请改脚本里的 SEGMENTS，时长会自动重算。

---

## 一、录制规格（先按这个把参数定下来）

| 项 | 要求 | 说明 |
|---|---|---|
| 时长 | **${fmt(totalSec)}**（落在 5-8 分钟内） | 逐字稿 ${rows.reduce((a, r) => a + r.chars, 0)} 字，语速 4.2 字/秒 |
| 分辨率 | **1920×1080 或 2560×1440**，30fps | 官方要求 ≥1080p，别用 720p 放大 |
| 画幅 | 16:9 全屏录屏 | 竖屏素材会被裁切 |
| 声音 | 普通话，麦克风距嘴 15cm | 关窗、关风扇，别用笔记本内置麦 |
| 浏览器 | Chrome，缩放 **100%**（Ctrl+0） | 否则字会发虚 |
| 窗口 | 只留浏览器，隐藏书签栏（Ctrl+Shift+B） | 别露出私人标签页 |
| 鼠标 | 移动放慢，点击后停 0.6 秒 | 评委要看清点了什么 |
| 字幕 | 建议后期加，关键词见第五节 | 不加也行，但要口齿清楚 |

**录制前 3 分钟检查**：双击 \`启动网站.bat\` → 等出现"服务已启动" → 打开 \`http://localhost:3000\` → 确认右上角**没有**"离线演示"提示（有就重启服务）。

---

## 二、评分项 → 段落对照

官方 100 分：AI 技术 35（大模型 8 / Agent 8 / RAG 6 / 多模态 5 / 安全 4 / MCP 4）、创新 25（选题 10 / 技术 8 / 交互 7）、前端工程 10（代码 4 / 组件 3 / 性能 3）、实用性 10、用户体验 10、社会价值与商业 10。

| 段落 | 时间 | 字数 | 主要拿的分 |
|---|---|---|---|`);
for (const r of rows) {
  md.push(`| ${r.title.replace('　', ' ')} | ${fmt(r.from)}-${fmt(r.to)} | ${r.chars} | ${r.score} |`);
}
md.push(`
---

## 三、逐字口播稿（照读；\`【】\`是动作，不要念出来）

> 提词器里每段左侧有目标秒数，超时 3 秒数字变红，超时 6 秒只提醒不跳段——宁可慢，不要抢。
`);

for (const r of rows) {
  md.push(`
### ${r.title} ｜ ${fmt(r.from)}-${fmt(r.to)} ｜ ${r.dur}s

**${r.cue}**

\`\`\`
${r.text}
\`\`\`
`);
}

md.push(`
---

## 四、每一段的要点（不要说错的地方）

| 段落 | 一定要落地的东西 |
|---|---|
| 1 | 开头 15 秒不要报技术栈，先立"问题"。全片只有首尾允许有情绪 |
| 2 | **真的点一次**统计数字跳转（评委看的就是"能不能用"），点完停 0.6 秒再说话 |
| 3 | "506 条语义片段"后面段 5 会再呼应一次；被问评测量要如实说"自建集，有偏差" |
| 5 | **拒答必须真的演出来**，不是口述。这是评委最爱记笔记的地方 |
| 6 | 轨迹要让评委看到"工具返回了什么"（鼠标停在 observation 上 2 秒）；发布后真跳到项目页 |
| 7 | 强调"不上传""不出本机"，这是多模态里最容易被记住的差异点 |
| 9 | 不念命令，只念**结论**；让绿色对勾露在画面上就够了 |
| 10 | 收尾句要慢，最后一个字落下再停 1 秒再结束录制 |

---

## 五、字幕与 B-roll 建议

| 位置 | 建议关键词（一屏不超过 12 字） |
|---|---|
| 段 1 | 非遗不缺内容，缺一起做的人 |
| 段 2 | 20 个页面 · 同源 · 数字可点 |
| 段 3 | 源流 / 工艺 / 看点 / 传承人 / 实拍 |
| 段 5 | BM25 + 四层加权 · 无据不答 |
| 段 6 | 5 次工具调用 · 事实来自工具 |
| 段 7 | 72 维端侧比对 · 确定性随机 |
| 段 9 | 30 单测 · 105 题 · 8 项自检 |
| 段 10 | 让想做点事的人，找到对的人 |

---

## 六、如果只能录 5 分钟（精简版）

删这三处，其余不变：

| 删掉 | 省下 | 影响 |
|---|---|---|
| 段 3 的后两句（传承人/展馆/506 条） | 约 15s | 实用性略降，可在段 5 一句带过"506 条片段" |
| 段 4 整个总览 | 约 ${rows[3].dur}s | 直接进 RAG，段 5 开头补一句"AI 有四块能力，先看问答" |
| 段 9 的无障碍与性能细节 | 约 10s | 前端工程略降 |

**不要删**：段 5 的拒答、段 6 的完整轨迹与一键发布、段 7 的"图不出本机"。

---

## 七、录完自检（逐条打勾再上传）

- [ ] 时长在 **5:00-8:00** 之间
- [ ] 全程 **≥1080p**，无黑边、无缩放模糊
- [ ] 全程无"离线演示"提示条（说明后端真的在跑）
- [ ] 段 5 的拒答**真的出现了**（不是口述）
- [ ] 段 6 的轨迹**5 步都出现**过，且能看到工具返回内容
- [ ] 段 6 结尾**真的跳到了新建的项目页**
- [ ] 段 7 拖入的图片**真的出了相似结果**（别用空白图凑）
- [ ] 全程没有人名/手机号/微信/学号等隐私信息
- [ ] 没有弹窗、没有浏览器报错红字、没有其他标签页内容
- [ ] 声音清楚、无回声、无键盘声盖住人声
- [ ] 文件名：\`河南省非物质文化遗产共创平台-B组-演示视频.mp4\`
- [ ] 上传后**自己下载一遍**确认能播

---

## 八、常见翻车点

| 现象 | 原因 | 处理 |
|---|---|---|
| 视频里出现"离线演示" | 后端没起来 | 先双击 \`启动网站.bat\`，看到"服务已启动"再录 |
| AI 问答转圈很久 | 没配 Key 且走了超时 | 提前看 \`/health\` 正常；内置知识库回答很快 |
| Agent 轨迹只出现一步 | 中途刷新了页面 | 一次跑完，轨迹生成时别动别的页面 |
| 纹样每次都不同 | 忘了固定种子 | 演示时固定同一项目 + 同一风格 + 同一颗种子 |
| 字体发虚 | 浏览器缩放不是 100% | Ctrl+0 复位后再录 |
| 时长超 8 分钟 | 念太快或反复重录拼接过长 | 按本稿时间码掐表，每段单独录再拼 |

---

## 九、念稿提示

- 每段开头压低半度，段尾上扬——听起来不像背书。
- 数字要慢：**四十九**、**五百零六**、**三十**、**一百零五**——数字是评委要抄进笔记的。
- 重读这些词：**不是装饰**、**宁可说不懂**、**不上传**、**可复现**、**闭环**、**事实全部来自工具返回**。
- 段 5 说完"它拒答了"停 1 秒。
- 段 6 说到"点'一键发布'"就点，不要先点再说。
`);

fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');
console.log(
  '已生成',
  path.relative(ROOT, OUT_MD),
  '（' + fmt(totalSec) + '，' + rows.reduce((a, r) => a + r.chars, 0) + ' 字）'
);

/* ---------- 生成提词器 html ---------- */
const data = JSON.stringify(
  rows.map((r) => [r.title, r.dur, r.cue, r.text]),
  null,
  0
);
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>演示视频提词器 · 非遗共创平台</title>
<style>
  :root { --bg:#14100c; --panel:#1f1913; --ink:#f3ead9; --muted:#a89b87; --gold:#d6b36a; --red:#b23a48; --blue:#7fa3c7; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); height:100vh; display:flex; flex-direction:column; overflow:hidden;
         font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",system-ui,sans-serif; }
  header { display:flex; align-items:center; gap:14px; padding:10px 18px; background:var(--panel); border-bottom:1px solid #332a20; flex:0 0 auto; }
  .brand { font-weight:700; color:var(--gold); }
  .brand small { display:block; color:var(--muted); font-weight:400; font-size:11px; }
  .clock { margin-left:auto; display:flex; gap:20px; align-items:baseline; font-variant-numeric:tabular-nums; }
  .clock b { font-size:26px; } .clock span { color:var(--muted); font-size:12px; }
  .seg-time b { color:var(--gold); } .seg-time.over b { color:var(--red); }
  #progress { height:4px; background:#2a231b; flex:0 0 auto; }
  #progress > i { display:block; height:100%; width:0; background:linear-gradient(90deg,var(--gold),#e8cd92); }
  main { flex:1 1 auto; display:flex; min-height:0; }
  #list { width:250px; flex:0 0 auto; overflow-y:auto; border-right:1px solid #332a20; background:#191410; padding:8px 0; }
  #list a { display:block; padding:8px 14px; color:var(--muted); text-decoration:none; font-size:13px; line-height:1.45; border-left:3px solid transparent; cursor:pointer; }
  #list a:hover { background:#221b15; color:var(--ink); }
  #list a.active { background:#2b2218; color:var(--gold); border-left-color:var(--gold); }
  #list a .t { float:right; font-variant-numeric:tabular-nums; font-size:11px; color:#6d6152; }
  #list a.done { opacity:.5; }
  #stage { flex:1 1 auto; display:flex; flex-direction:column; min-width:0; padding:16px 34px 8px; }
  #seg-head { display:flex; align-items:baseline; gap:12px; flex:0 0 auto; }
  #seg-title { font-size:20px; font-weight:700; color:var(--gold); }
  #seg-meta { color:var(--muted); font-size:13px; }
  #cue { color:var(--blue); font-size:14px; margin:6px 0 10px; flex:0 0 auto; }
  #text { flex:1 1 auto; overflow-y:auto; font-size:34px; line-height:1.72; letter-spacing:.3px; white-space:pre-wrap; padding-right:10px; }
  #text em { font-style:normal; color:var(--gold); }
  #text .num { color:#e8cd92; font-weight:700; }
  footer { flex:0 0 auto; display:flex; gap:8px; align-items:center; padding:8px 18px; border-top:1px solid #332a20; background:var(--panel); font-size:12px; color:var(--muted); }
  button { background:#2a231b; color:var(--ink); border:1px solid #3d3327; border-radius:6px; padding:6px 12px; font-size:13px; cursor:pointer; font-family:inherit; }
  button:hover { border-color:var(--gold); color:var(--gold); }
  button.primary { background:var(--gold); color:#221b12; border-color:var(--gold); font-weight:700; }
  kbd { background:#2a231b; border:1px solid #3d3327; border-bottom-width:2px; border-radius:4px; padding:1px 5px; font-size:11px; }
  .spacer { margin-left:auto; }
</style>
</head>
<body>
<header>
  <div class="brand">演示视频提词器<small>河南省非物质文化遗产共创平台 · 平顶山学院 B 组</small></div>
  <div class="clock">
    <div class="seg-time"><span>本段</span> <b id="segClock">0:00</b></div>
    <div class="total-time"><span>全片</span> <b id="totalClock">0:00</b> <span>/ ${fmt(totalSec)}</span></div>
  </div>
</header>
<div id="progress"><i></i></div>
<main>
  <nav id="list"></nav>
  <section id="stage">
    <div id="seg-head"><span id="seg-title"></span><span id="seg-meta"></span></div>
    <div id="cue"></div>
    <div id="text"></div>
  </section>
</main>
<footer>
  <button id="play" class="primary">开始（空格）</button>
  <button id="prev">上一段（←）</button>
  <button id="next">下一段（→）</button>
  <button id="reset">复位（R）</button>
  <span class="spacer"></span>
  <span><kbd>空格</kbd> 暂停/继续 · <kbd>←</kbd><kbd>→</kbd> 切段 · <kbd>R</kbd> 复位 · <kbd>+</kbd><kbd>-</kbd> 字号</span>
</footer>
<script>
const SEGMENTS = ${data};
const TOTAL_TARGET = ${totalSec};
const listEl = document.getElementById('list');
const textEl = document.getElementById('text');
const segTitle = document.getElementById('seg-title');
const segMeta = document.getElementById('seg-meta');
const cueEl = document.getElementById('cue');
const segClock = document.getElementById('segClock');
const totalClock = document.getElementById('totalClock');
const segTimeBox = document.querySelector('.seg-time');
const playBtn = document.getElementById('play');
const bar = document.querySelector('#progress > i');
let idx = 0, elapsed = 0, total = 0, playing = false, timer = null, fontSize = 34;
const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function hl(src) {
  return src.replace(/(\\d+(?:\\.\\d+)?%?)/g, '<span class="num">$1</span>').replace(/（[^）]*）/g, (m) => '<em>' + m + '</em>');
}
function renderList() {
  listEl.innerHTML = SEGMENTS.map((s, i) =>
    '<a data-i="' + i + '" class="' + (i === idx ? 'active' : '') + (i < idx ? ' done' : '') + '"><span class="t">' + s[1] + 's</span>' + s[0] + '</a>'
  ).join('');
}
function render() {
  const s = SEGMENTS[idx];
  segTitle.textContent = s[0];
  segMeta.textContent = '目标 ' + s[1] + ' 秒';
  cueEl.textContent = s[2];
  textEl.innerHTML = hl(s[3]);
  textEl.scrollTop = 0;
  renderList();
  paint();
}
function paint() {
  segClock.textContent = fmt(elapsed);
  totalClock.textContent = fmt(total);
  segTimeBox.classList.toggle('over', elapsed > SEGMENTS[idx][1] + 3);
  bar.style.width = Math.min(100, (total / TOTAL_TARGET) * 100) + '%';
}
function tick() { elapsed += 1; total += 1; paint(); }
function start() { if (playing) return; playing = true; playBtn.textContent = '暂停（空格）'; timer = setInterval(tick, 1000); }
function pause() { playing = false; playBtn.textContent = '继续（空格）'; clearInterval(timer); timer = null; }
function toggle() { playing ? pause() : start(); }
function goto(i, keepTotal) {
  if (i < 0 || i >= SEGMENTS.length) return;
  idx = i; elapsed = 0;
  if (!keepTotal) total = SEGMENTS.slice(0, idx).reduce((a, s) => a + s[1], 0);
  render();
}
document.getElementById('play').onclick = toggle;
document.getElementById('next').onclick = () => goto(idx + 1);
document.getElementById('prev').onclick = () => goto(idx - 1);
document.getElementById('reset').onclick = () => { pause(); total = 0; goto(0); render(); };
listEl.onclick = (e) => { const a = e.target.closest('a[data-i]'); if (a) goto(Number(a.dataset.i)); };
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); goto(idx + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goto(idx - 1); }
  else if (e.key.toLowerCase() === 'r') { document.getElementById('reset').click(); }
  else if (e.key === '+' || e.key === '=') { fontSize = Math.min(56, fontSize + 2); textEl.style.fontSize = fontSize + 'px'; }
  else if (e.key === '-') { fontSize = Math.max(20, fontSize - 2); textEl.style.fontSize = fontSize + 'px'; }
});
textEl.style.fontSize = fontSize + 'px';
render();
</script>
</body>
</html>`;
fs.writeFileSync(OUT_HTML, html, 'utf8');
console.log('已生成', path.relative(ROOT, OUT_HTML));
console.log('\n段落时长：');
rows.forEach((r) =>
  console.log(
    `  ${r.title.replace('　', ' ')}  ${fmt(r.from)}-${fmt(r.to)}  ${String(r.dur).padStart(3)}s  ${String(r.chars).padStart(4)} 字`
  )
);
console.log(`\n合计 ${fmt(totalSec)} / ${rows.reduce((a, r) => a + r.chars, 0)} 字`);
