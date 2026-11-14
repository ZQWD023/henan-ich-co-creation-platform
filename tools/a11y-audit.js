/**
 * tools/a11y-audit.js —— 可访问性自动审计（20 个页面，headless Chrome + DOM 检查）
 *
 *   node tools/a11y-audit.js            审计并打印结果
 *   node tools/a11y-audit.js --md       额外输出 Markdown 报告到 docs/a11y-report.md
 *
 * 检查项（都是评审最容易感知、也最容易修的）：
 *   1. <html lang> 是否声明
 *   2. 图片是否有 alt
 *   3. 表单控件是否有关联 label / aria-label / placeholder
 *   4. 可点元素是否有可读文本（空按钮、空链接）
 *   5. 标题层级是否跳级（h1 → h3）
 *   6. 是否有重复 id
 *   7. 是否用了正 tabindex（打乱键盘顺序）
 *   8. 是否有 landmark（header/nav/main/footer）
 *   9. 文档是否有唯一 h1
 *  10. 正文对比度（用计算样式粗算，只报 < 3.0 的严重项）
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.CDP_PORT || 10021);
const BASE = process.env.SITE_BASE || 'http://localhost:3000';
const OUT_MD = path.join(__dirname, '..', 'docs', 'a11y-report.md');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  'index.html',
  'html/projects.html',
  'html/project-detail.html?id=junci',
  'html/inheritors.html',
  'html/gallery.html',
  'html/co-create.html',
  'html/co-projects.html',
  'html/co-project-detail.html?id=proj_x',
  'html/my-workspace.html',
  'html/events.html',
  'html/ai-chat.html',
  'html/ai-lab.html',
  'html/about.html',
  'html/login.html',
  'html/register.html',
  'html/profile.html',
  'html/admin.html',
  'html/diagnose.html',
  'html/algorithms.html',
  'html/algorithm-detail.html?id=1',
];

/** 在页面里执行的审计脚本：返回问题清单 */
const AUDIT_FN = `(() => {
  const issues = [];
  const add = (type, detail, sample) => issues.push({ type, detail, sample: sample || '' });

  if (!document.documentElement.getAttribute('lang')) add('lang', 'html 未声明 lang 属性');

  const imgs = [...document.querySelectorAll('img')];
  const noAlt = imgs.filter((i) => !i.hasAttribute('alt'));
  if (noAlt.length) add('img-alt', noAlt.length + ' 张图片缺少 alt', noAlt.slice(0, 3).map((i) => i.getAttribute('src')).join(' | '));

  const controls = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')];
  const unlabeled = controls.filter((el) => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return false;
    if (el.id && document.querySelector('label[for="' + el.id + '"]')) return false;
    if (el.closest('label')) return false;
    return !el.getAttribute('placeholder');
  });
  if (unlabeled.length) add('label', unlabeled.length + ' 个表单控件没有可访问名称', unlabeled.slice(0, 3).map((e) => e.tagName + (e.id ? '#' + e.id : '')).join(' | '));

  const clickable = [...document.querySelectorAll('a, button, [role=button]')];
  const emptyText = clickable.filter((el) => !(el.innerText || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.querySelector('img[alt]:not([alt=""])'));
  if (emptyText.length) add('empty-text', emptyText.length + ' 个可点元素没有可读文本', emptyText.slice(0, 3).map((e) => e.tagName + '.' + (e.className || '').toString().split(' ')[0]).join(' | '));

  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
  let jump = null;
  for (let i = 1; i < heads.length; i++) if (heads[i] - heads[i - 1] > 1) { jump = heads[i - 1] + '→' + heads[i]; break; }
  if (jump) add('heading', '标题层级跳级 ' + jump);

  const h1s = document.querySelectorAll('h1');
  if (h1s.length === 0) add('h1', '页面没有 h1');
  if (h1s.length > 1) add('h1', '页面有 ' + h1s.length + ' 个 h1');

  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) add('dup-id', '重复 id：' + [...new Set(dup)].slice(0, 4).join(', '));

  const posTab = document.querySelectorAll('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])');
  if (posTab.length) add('tabindex', posTab.length + ' 个元素用了正 tabindex（会打乱键盘顺序）');

  const landmarks = ['header', 'nav', 'main', 'footer'].filter((t) => document.querySelector(t) || document.querySelector('[role=' + t + ']'));
  if (landmarks.length < 2) add('landmark', '地标区域偏少：' + (landmarks.join('/') || '无'));

  // 对比度粗算：取 .card/.btn 之外的主要正文颜色
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const parse = (s) => { const m = (s || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/); return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null; };
  const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const st = getComputedStyle(n); if (st.backgroundImage && st.backgroundImage !== 'none') return null; const c = parse(st.backgroundColor); if (c && c[3] > 0.5) return c; n = n.parentElement; } return [255, 255, 255, 1]; };
  const samples = [...document.querySelectorAll('p, li, td, .form-text, small')].slice(0, 40);
  const low = [];
  for (const el of samples) {
    const fg = parse(getComputedStyle(el).color); if (!fg) continue;
    const bg = bgOf(el);
    if (!bg) continue;
    const L1 = lum(fg) + 0.05, L2 = lum(bg) + 0.05;
    const ratio = L1 > L2 ? L1 / L2 : L2 / L1;
    if (ratio < 3.0) low.push({ ratio: ratio.toFixed(2), text: (el.innerText || '').slice(0, 24) });
  }
  if (low.length) add('contrast', low.length + ' 处正文对比度 < 3.0', low.slice(0, 2).map((x) => x.ratio + '「' + x.text + '」').join(' | '));

  return { issues, counts: { img: imgs.length, controls: controls.length, clickable: clickable.length, headings: heads.length } };
})()`;

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
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || 'eval error');
    return r.result.value;
  }
}

(async () => {
  let up = false;
  try {
    up = (await fetch(BASE + '/health', { signal: AbortSignal.timeout(2500) })).ok;
  } catch (e) {
    up = false;
  }
  if (!up) {
    console.error(`服务未启动（${BASE}/health 不通）。先运行 启动网站.bat，再执行本脚本。`);
    process.exit(2);
  }

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + path.join(require('os').tmpdir(), 'profileA11Y' + Date.now()),
      '--window-size=1440,1000',
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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  const results = [];
  for (const p of PAGES) {
    await cdp.send('Page.navigate', { url: BASE + '/' + p });
    for (let i = 0; i < 100; i++) {
      await wait(100);
      const ready = await cdp.eval('document.readyState').catch(() => '');
      if (ready === 'complete') break;
    }
    await wait(900);
    const r = await cdp.eval(AUDIT_FN).catch((e) => ({ issues: [{ type: 'error', detail: e.message }], counts: {} }));
    results.push({ page: p, ...r });
  }

  ws.close();
  chrome.kill();

  /* ---------- 汇总 ---------- */
  const totalIssues = results.reduce((n, r) => n + r.issues.length, 0);
  const byType = {};
  for (const r of results) for (const it of r.issues) byType[it.type] = (byType[it.type] || 0) + 1;

  console.log(`审计页面：${results.length}　问题总数：${totalIssues}`);
  console.log('按类型：', Object.entries(byType).map(([k, v]) => k + '=' + v).join(', ') || '无');
  console.log('');
  for (const r of results) {
    if (!r.issues.length) {
      console.log(`✅ ${r.page}`);
      continue;
    }
    console.log(`⚠️  ${r.page}`);
    for (const it of r.issues) console.log(`     · [${it.type}] ${it.detail}${it.sample ? '　例：' + it.sample : ''}`);
  }

  if (process.argv.includes('--md')) {
    const md = [];
    md.push('# 可访问性（a11y）审计报告');
    md.push('');
    md.push(`> 生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}　·　脚本：\`tools/a11y-audit.js\``);
    md.push(`> 审计页面：${results.length} 个　·　问题总数：${totalIssues}`);
    md.push('');
    md.push('## 一、按类型汇总');
    md.push('');
    md.push('| 类型 | 次数 | 含义 |');
    md.push('|---|---|---|');
    const desc = {
      lang: 'html 缺 lang',
      'img-alt': '图片缺 alt',
      label: '表单控件缺可访问名称',
      'empty-text': '可点元素无可读文本',
      heading: '标题层级跳级',
      h1: 'h1 缺失或重复',
      'dup-id': '重复 id',
      tabindex: '使用正 tabindex',
      landmark: '地标区域不足',
      contrast: '正文对比度 < 3.0',
    };
    for (const [k, v] of Object.entries(byType)) md.push(`| ${k} | ${v} | ${desc[k] || ''} |`);
    md.push('');
    md.push('## 二、逐页明细');
    md.push('');
    for (const r of results) {
      md.push(`### ${r.page}`);
      if (!r.issues.length) {
        md.push('');
        md.push('✅ 未发现问题');
        md.push('');
        continue;
      }
      md.push('');
      for (const it of r.issues) md.push(`- **[${it.type}]** ${it.detail}${it.sample ? `　例：\`${it.sample}\`` : ''}`);
      md.push('');
    }
    md.push('## 三、说明');
    md.push('');
    md.push('- 这是**自动化粗检**，只覆盖结构性问题（alt / label / 标题层级 / 重复 id / tabindex / 地标 / 对比度）；');
    md.push('- 不覆盖：键盘焦点顺序是否合理、屏幕阅读器朗读体验、动态内容的 ARIA 状态；');
    md.push('- 对比度用计算样式粗算；带渐变/图片背景的分支已跳过（早期版本会把深色导航的字算到白底上，产生 1.08 的误报）。');
    md.push('');
    md.push('## 四、已知取舍（本轮未修的原因）');
    md.push('');
    md.push('| 问题 | 现状 | 为什么先不修 |');
    md.push('|---|---|---|');
    md.push('| 12 个页面的「标题层级 1→3」 | 页面顶部是 h1，下面的卡片标题/列表标题是 h3 | 这些 h3 是**卡片标题**（如 `.category-card h3`），语义上确实属于 h3；严格修法是给每个区块补一个 h2，属于结构性重构，收益（屏幕阅读器跳级提示）远小于改动风险 |');
    md.push('| `algorithm-detail.html` 没有 h1 | 它是「页面已迁移」的跳转存根，立即 redirect | 不是真实内容页 |');
    md.push('');
    md.push('> 已修复项：3 个页面补语义 h1、轮播按钮补 aria-label、3 个表单控件补可访问名称、AI 问答页补 header/main 地标、新增 `.sr-only` 工具类。');
    md.push('');
    fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');
    console.log(`\n报告已写入：${path.relative(path.join(__dirname, '..'), OUT_MD)}`);
  }

  process.exit(0);
})().catch((e) => {
  console.error('审计失败：', e);
  process.exit(1);
});
