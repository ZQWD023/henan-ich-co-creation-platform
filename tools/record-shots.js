// tools/record-shots.js —— 录屏素材包：按视频脚本的关键镜头，自动截 1080p 截图
//
//   node tools/record-shots.js
//
// 产物：docs/shots/01-home.png … 以及 docs/shots/index.md（每张图配"这一段该说什么"）
// 用途：① 剪视频时当 B-roll 垫片；② 录屏失败时的保底素材；③ 技术文档/PPT 配图。
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.CDP_PORT || 10033);
const BASE = process.env.SITE_BASE || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'docs', 'shots');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 镜头清单：与 docs/ppt/答辩口播稿.md 的 P4 段一致 */
const SHOTS = [
  { id: '01-home', url: '/index.html', wait: 2200, title: '首页', say: '开场：非遗不缺内容，缺的是把内容变成协作的人。' },
  { id: '02-stats', url: '/index.html', wait: 2000, title: '首页数据条', say: '49 个项目、41 个国家级、18 位传承人、10 大分类 —— 数字都能点进去。', scroll: 900 },
  { id: '03-library', url: '/html/projects.html', wait: 2600, title: '非遗项目库', say: '项目库：每个项目都有工艺流程、源流、看点与真实照片。' },
  { id: '04-detail', url: '/html/project-detail.html?id=junci', wait: 2600, title: '项目详情（钧瓷）', say: '详情页：工艺步骤、技艺看点、代表性传承人。' },
  { id: '05-ai-chat', url: '/html/ai-chat.html', wait: 2000, title: 'AI 问答入口', say: 'AI 问答：回答必带检索依据，没有 Key 也能跑。' },
  { id: '06-ai-lab-agent', url: '/html/ai-lab.html', wait: 2400, title: 'AI 实验室 · Agent', say: '一句话需求 → 5 步工具调用 → 可发布的共创方案。' },
  { id: '07-ai-lab-vision', url: '/html/ai-lab.html#vision', wait: 2000, title: 'AI 实验室 · 以图搜非遗', say: '图片不出本机，72 维特征在浏览器里比对。' },
  { id: '08-pattern', url: '/html/ai-lab.html#pattern', wait: 2200, title: 'AI 实验室 · 纹样生成', say: '取项目配色的纹样生成，可下载 PNG，同种子同图。' },
  { id: '09-co-create', url: '/html/co-create.html', wait: 2600, title: '共创广场', say: '作品广场：真实作品 + 封面 + 点赞收藏。' },
  { id: '10-co-projects', url: '/html/co-projects.html', wait: 2600, title: '共创项目', say: '共创项目：招募中 / 协作中 / 已结项，带任务进度。' },
  { id: '11-workspace', url: '/html/my-workspace.html', wait: 2600, title: '我的工作台', say: '工作台：我的项目、任务、投稿、消息一屏看完。' },
  { id: '12-events', url: '/html/events.html', wait: 2600, title: '活动资讯', say: '活动与资讯：报名、地点、时间。' },
];

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result ? r.result.value : null;
  }
}

(async () => {
  try {
    const ok = (await fetch(BASE + '/health', { signal: AbortSignal.timeout(2500) })).ok;
    if (!ok) throw new Error('health not ok');
  } catch (e) {
    console.error(`服务没起来（${BASE}/health）。先启动 启动网站.bat，再运行本脚本。`);
    process.exit(2);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + path.join(require('os').tmpdir(), 'profileShots' + Date.now()),
      '--window-size=1920,1080',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let target = null;
  for (let i = 0; i < 80; i++) {
    await wait(300);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch (e) {
      /* retry */
    }
  }
  if (!target) throw new Error('Chrome 没起来');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener('open', r);
    ws.addEventListener('error', j);
  });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  // 用 creator 账号登录（演示需要）
  await cdp.send('Page.navigate', { url: BASE + '/html/login.html' });
  await wait(1500);
  await cdp.eval(`(() => {
    const el = document.getElementById('login-username'); if (el) el.value = 'creator';
    const pw = document.getElementById('login-password'); if (pw) pw.value = '123456';
    const f = document.getElementById('loginForm'); if (f) f.dispatchEvent(new Event('submit',{cancelable:true}));
    return true;
  })()`);
  await wait(2500);

  const rows = [];
  for (const s of SHOTS) {
    const url = BASE + s.url;
    await cdp.send('Page.navigate', { url });
    for (let i = 0; i < 120; i++) {
      await wait(100);
      const ready = await cdp.eval('document.readyState').catch(() => '');
      if (ready === 'complete') break;
    }
    await wait(s.wait);
    if (s.scroll) {
      await cdp.eval(`window.scrollTo({top:${s.scroll},behavior:'instant'}); true`);
      await wait(700);
    }
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, s.id + '.png');
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`✅ ${s.id}.png（${kb} KB）  ${s.title}`);
    rows.push({ ...s, kb });
  }

  // 索引文件：每张图配一句旁白
  const md = [];
  md.push('# 录屏素材包（1080p）');
  md.push('');
  md.push(`> 生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}　·　脚本：\`tools/record-shots.js\``);
  md.push('> 分辨率：1920×1080（符合官方"不低于 1080p"）');
  md.push('');
  md.push('## 一、镜头清单（按录制顺序）');
  md.push('');
  md.push('| # | 文件 | 页面 | 这一段该说什么 |');
  md.push('|---|---|---|---|');
  rows.forEach((r, i) => md.push(`| ${i + 1} | \`docs/shots/${r.id}.png\` | ${r.title} | ${r.say} |`));
  md.push('');
  md.push('## 二、录制执行单（照着做，2-3 小时能录完）');
  md.push('');
  md.push('**准备（10 分钟）**');
  md.push('');
  md.push('1. 双击 `启动网站.bat`，确认 <http://localhost:3000/> 能打开；');
  md.push('2. 跑一次 `npm run verify`（8 项全过再录）；');
  md.push('3. 浏览器**全屏（F11）**，缩放 100%，关掉多余标签页；');
  md.push('4. 登录 `creator / 123456`（演示"发布"需要登录）；');
  md.push('5. 录屏软件设 **1920×1080 / 30fps / 麦克风开启**；');
  md.push('6. 微信、输入法候选框、系统通知全部关掉。');
  md.push('');
  md.push('**分段录（每段单独录，错了只重录这一段）**');
  md.push('');
  md.push('| 段 | 时长 | 内容 | 对应素材 |');
  md.push('|---|---|---|---|');
  md.push('| 1 | 50s | 开场 + 痛点（口播稿 P1-P2） | `01-home.png`、`02-stats.png` |');
  md.push('| 2 | 40s | 产品全景 + 项目库（P3） | `03-library.png`、`04-detail.png` |');
  md.push('| 3 | 70s | AI 问答（P5 前段） | 现场操作，不用图 |');
  md.push('| 4 | 90s | **Agent 5 步 + 一键发布**（全片重点） | `06-ai-lab-agent.png` |');
  md.push('| 5 | 50s | 多模态两连（以图搜非遗 + 纹样生成） | `07`、`08` |');
  md.push('| 6 | 60s | 共创广场 / 工作台 / 活动（P9 前） | `09`、`10`、`11`、`12` |');
  md.push('| 7 | 40s | 工程与数据（P9-P10） | 可切到终端跑 `npm run verify` |');
  md.push('| 8 | 30s | 收尾（P13） | 回到首页 |');
  md.push('');
  md.push('**剪辑（30 分钟）**');
  md.push('');
  md.push('- 剪掉加载等待、鼠标乱晃；每段之间加 0.3s 淡入；');
  md.push('- 关键处加字幕：`Top-1 100%`、`5 步工具调用`、`一键发布`；');
  md.push('- 导出 **MP4 / H.264 / 1080p / 码率 6-8 Mbps**；');
  md.push('- 文件名：`传智杯_团队名_非遗共创平台_演示视频.mp4`；');
  md.push('');
  md.push('**上传前自检**');
  md.push('');
  md.push('- [ ] 时长 5-8 分钟；');
  md.push('- [ ] 普通话讲解清楚，有字幕更好；');
  md.push('- [ ] 没有暴露 `.env`、密钥、个人隐私窗口；');
  md.push('- [ ] 自己完整看一遍（很多人漏这步）。');
  md.push('');
  fs.writeFileSync(path.join(OUT, 'index.md'), md.join('\n'), 'utf8');

  ws.close();
  chrome.kill();
  console.log(`\n共 ${rows.length} 张，已写入 ${path.relative(path.join(__dirname, '..'), OUT)}/index.md`);
  process.exit(0);
})().catch((e) => {
  console.error('截图失败：', e);
  process.exit(1);
});
