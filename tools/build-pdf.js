// tools/build-pdf.js —— 把 docs/技术文档.md 渲染成 PDF（A4、带页码），并统计页数
//
// 为什么自己写：不引入 pandoc/LaTeX 依赖，用已有的 headless Chrome 打印，
// 字体、表格、代码块都由 CSS 控制，结果可复现。
//
// 用法：node tools/build-pdf.js [输入.md] [输出.pdf]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv[2] || path.join(ROOT, 'docs', '技术文档.md');
const OUT = process.argv[3] || SRC.replace(/\.md$/, '.pdf');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.CDP_PORT || 9988);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 极简 Markdown → HTML（只覆盖本项目用到的语法） ---------------- */
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="inline-img" src="$2" alt="$1">');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function mdToHtml(md, baseDir) {
  const toAbs = (src) => {
    if (/^https?:/.test(src)) return src;
    const abs = path.resolve(baseDir || '.', src).replace(/\\/g, '/');
    return 'file:///' + abs;
  };
  const imgHtml = (alt, src) =>
    '<figure><img src="' + toAbs(src) + '" alt="' + alt + '"><figcaption>' + alt + '</figcaption></figure>';
  const lines = md.split(/\r?\n/);
  const html = [];
  let i = 0;
  let inCode = false;
  let codeBuf = [];

  const flushTable = (rows) => {
    if (!rows.length) return;
    const cells = rows.map((r) =>
      r
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim())
    );
    const head = cells[0];
    const body = cells.slice(1).filter((c) => !c.every((x) => /^:?-{2,}:?$/.test(x)));
    html.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
    for (const r of body) html.push('<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
    html.push('</tbody></table>');
  };

  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    html.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };

  let tableBuf = [];
  const flushTableBuf = () => {
    if (tableBuf.length) flushTable(tableBuf);
    tableBuf = [];
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // 代码块
    if (/^```/.test(line.trim())) {
      if (!inCode) {
        flushPara();
        flushTableBuf();
        inCode = true;
        codeBuf = [];
      } else {
        html.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
        inCode = false;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      i++;
      continue;
    }

    // 表格行
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      tableBuf.push(line.trim());
      i++;
      continue;
    } else {
      flushTableBuf();
    }

    const imgOnly = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgOnly) {
      flushPara();
      html.push(imgHtml(imgOnly[1], imgOnly[2]));
      i++;
      continue;
    }

    if (!line.trim()) {
      flushPara();
      i++;
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // 分隔线
    if (/^---+$/.test(line.trim())) {
      flushPara();
      html.push('<hr>');
      i++;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      flushPara();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // 列表（含 - [ ] 任务列表）
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '').replace(/^\[[ x]\]\s*/, (m) => (m.includes('x') ? '☑ ' : '☐ ')));
        i++;
      }
      html.push('<ul>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ul>');
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      html.push('<ol>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ol>');
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushPara();
  flushTableBuf();
  return html.join('\n');
}

const CSS = `
  @page { size: A4; margin: 16mm 15mm 18mm 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
    font-size: 9.6pt; line-height: 1.62; color: #1f1a14; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 19pt; margin: 0 0 6pt; color: #8c1f2a; letter-spacing: .5pt; }
  h2 { font-size: 13pt; margin: 14pt 0 5pt; padding-bottom: 3pt; border-bottom: 1.2pt solid #c19a4b; color: #8c1f2a; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 10pt 0 4pt; color: #4a3520; page-break-after: avoid; }
  h4 { font-size: 10pt; margin: 8pt 0 3pt; color: #4a3520; }
  p { margin: 4pt 0; text-align: justify; }
  ul, ol { margin: 4pt 0 4pt 16pt; padding: 0; }
  li { margin: 2pt 0; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 8.6pt; background: #f4efe6; padding: 0 2pt; border-radius: 2pt; }
  pre { background: #f7f3ec; border: .6pt solid #e0d6c4; border-left: 2.4pt solid #c19a4b; padding: 6pt 8pt; border-radius: 3pt; overflow: hidden; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8.2pt; line-height: 1.42; white-space: pre-wrap; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 8pt; font-size: 8.5pt; page-break-inside: auto; }
  th, td { border: .6pt solid #d8cdb9; padding: 3.2pt 4pt; vertical-align: top; text-align: left; }
  th { background: #f3ece0; font-weight: 600; color: #4a3520; }
  tr { page-break-inside: avoid; }
  blockquote { margin: 6pt 0; padding: 5pt 8pt; background: #fbf7ef; border-left: 2.4pt solid #c19a4b; color: #5b4a34; font-size: 9pt; }
  hr { border: none; border-top: .8pt dashed #d8cdb9; margin: 10pt 0; }
  figure { margin: 8pt 0 10pt; page-break-inside: avoid; text-align: center; }
  figure img { max-width: 100%; border: .6pt solid #d8cdb9; border-radius: 3pt; }
  figcaption { font-size: 8pt; color: #6b5b48; margin-top: 3pt; }
  img.inline-img { max-width: 100%; }
  a { color: #8c1f2a; text-decoration: none; }
  strong { color: #6d1720; }
`;

/* ---------------- 用 headless Chrome 打印 ---------------- */
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
}

(async () => {
  const md = fs.readFileSync(SRC, 'utf8');
  const body = mdToHtml(md, path.dirname(SRC));
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>技术文档</title>
<style>${CSS}</style></head><body>${body}</body></html>`;

  const tmp = path.join(os.tmpdir(), 'ich-techdoc.html');
  fs.writeFileSync(tmp, html, 'utf8');

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + path.join(os.tmpdir(), 'profilePDF' + Date.now()),
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
  await cdp.send('Page.navigate', { url: 'file:///' + tmp.replace(/\\/g, '/') });
  for (let i = 0; i < 100; i++) {
    await wait(100);
    const r = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (r.result.value === 'complete') break;
  }
  await wait(800);

  const pdf = await cdp.send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:7pt;color:#9a8a72;width:100%;text-align:center;padding-top:4mm;">河南省非物质文化遗产共创平台 · 技术文档</div>',
    footerTemplate:
      '<div style="font-size:7pt;color:#9a8a72;width:100%;text-align:center;padding-bottom:4mm;">第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</div>',
    margin: { top: '20mm', bottom: '18mm', left: '15mm', right: '15mm' },
  });

  fs.writeFileSync(OUT, Buffer.from(pdf.data, 'base64'));

  // 统计页数：PDF 里 /Count N（Pages 节点）
  const buf = fs.readFileSync(OUT);
  const text = buf.toString('latin1');
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  const pages = counts.length ? Math.max(...counts) : (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const kb = (buf.length / 1024).toFixed(0);

  console.log(`输入：${path.relative(ROOT, SRC)}（${md.split(/\r?\n/).length} 行）`);
  console.log(`输出：${path.relative(ROOT, OUT)}（${kb} KB，${pages} 页）`);
  console.log(pages > 30 ? '⚠️ 超过 30 页，需要压缩排版（调小字号/边距）' : '✅ 页数符合"不超过 30 页"的要求');

  ws.close();
  chrome.kill();
  await wait(200);
  process.exit(pages > 30 ? 2 : 0);
})().catch((e) => {
  console.error('构建失败：', e);
  process.exit(1);
});
