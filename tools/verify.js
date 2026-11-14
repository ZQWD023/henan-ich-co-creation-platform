/**
 * tools/verify.js —— 一键自检（提交前跑这个）
 *
 *   node tools/verify.js        或   npm run verify
 *
 * 检查 8 项，最后给一张表 + 退出码（有失败就非 0，便于 CI / 提交前拦）。
 * 不依赖浏览器；服务在跑时会额外探活接口，没跑则标注 SKIP。
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, '算法网站(3)');
const BACKEND = path.join(ROOT, 'backend');

const results = [];
function record(name, ok, detail, status) {
  results.push({ name, ok, detail, status: status || (ok ? 'PASS' : 'FAIL') });
  const icon = status === 'SKIP' ? '⏭' : ok ? '✅' : '❌';
  console.log(`${icon} ${name}  ${detail ? '· ' + detail : ''}`);
}

function run(cmd, cwd, opts = {}) {
  const r = spawnSync(cmd, { cwd: cwd || ROOT, shell: true, encoding: 'utf8', timeout: opts.timeout || 300000 });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  return { code: r.status == null ? -1 : r.status, out };
}

/* ---------------- 1. 页面与资源完整性 ---------------- */
function checkAssets() {
  const htmlDir = path.join(SITE, 'html');
  const pages = ['index.html']
    .map((p) => path.join(SITE, p))
    .concat(fs.readdirSync(htmlDir).filter((f) => f.endsWith('.html')).map((f) => path.join(htmlDir, f)));

  const missing = [];
  let refCount = 0;
  for (const page of pages) {
    // 去掉 <script>/<style> 里的内容：里面常有 JS 模板字符串（${item.href}），不是真实资源引用
    const html = fs
      .readFileSync(page, 'utf8')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|#|javascript:|mailto:|data:|ich:)/i.test(ref)) continue;
      if (ref.includes('${') || ref.includes('<%')) continue; // 模板占位符
      const clean = ref.split('?')[0].split('#')[0];
      if (!clean) continue;
      refCount++;
      const abs = path.resolve(path.dirname(page), clean);
      if (!fs.existsSync(abs)) missing.push(`${path.basename(page)} → ${ref}`);
    }
  }
  record(
    '① 页面与资源完整性',
    missing.length === 0,
    missing.length ? `${missing.length} 个引用缺失：${missing.slice(0, 3).join('；')}` : `${pages.length} 个页面 / ${refCount} 个本地引用全部存在`
  );
}

/* ---------------- 2-5. 静态检查与测试 ---------------- */
function checkLint() {
  const r = run('npm run lint --silent');
  record('② ESLint（前端 + 后端 + launcher）', r.code === 0, r.code === 0 ? '0 错误 0 告警' : r.out.split('\n').slice(-6).join(' '));
}

function checkFormat() {
  const r = run('npm run format:check --silent');
  record('③ Prettier 格式', r.code === 0, r.code === 0 ? '核心模块格式一致' : r.out.split('\n').slice(-3).join(' '));
}

function checkTypes() {
  const r = run('npm run typecheck --silent');
  record('④ TypeScript 类型检查（checkJs + JSDoc）', r.code === 0, r.code === 0 ? '0 错误（4 个核心前端模块）' : r.out.split('\n').slice(0, 3).join(' '));
}

function checkTests() {
  const r = run('npm test --silent', BACKEND);
  const m = r.out.match(/#\s*pass\s+(\d+)/) || r.out.match(/pass\s+(\d+)/);
  const f = r.out.match(/fail\s+(\d+)/);
  const pass = m ? Number(m[1]) : 0;
  const fail = f ? Number(f[1]) : 0;
  record('⑤ 后端单元测试', r.code === 0 && fail === 0, `pass ${pass} / fail ${fail}`);
}

/* ---------------- 6. RAG / Agent 评测 ---------------- */
function checkEval() {
  const r = run('node scripts/eval-rag.js', BACKEND);
  if (r.code !== 0) {
    record('⑥ RAG / Agent 评测', false, r.out.split('\n').slice(-3).join(' '));
    return;
  }
  // 末行汇总格式：Top-1 100.0% | Top-3 100.0% | 拒答 100.0% | 关键词 100.0% | 平均 1.08ms | Agent 5/5
  const summary = r.out.split('\n').find((l) => /^Top-1\s+[\d.]+%/.test(l.trim())) || '';
  const top1 = /Top-1\s+([\d.]+%)/.exec(summary);
  const top3 = /Top-3\s+([\d.]+%)/.exec(summary);
  const agent = /Agent\s+(\d+\/\d+)/.exec(summary);
  const agentOk = agent && agent[1].split('/')[0] === agent[1].split('/')[1];
  const ok = top1 && parseFloat(top1[1]) >= 90 && agentOk;
  record(
    '⑥ RAG / Agent 评测',
    !!ok,
    summary ? `Top-1 ${top1[1]}，Top-3 ${top3 ? top3[1] : '—'}，Agent ${agent ? agent[1] : '—'}` : '无法解析评测输出'
  );
}

/* ---------------- 7. 技术文档 PDF ---------------- */
function checkPdf() {
  const pdf = path.join(ROOT, 'docs', '技术文档.pdf');
  if (!fs.existsSync(pdf)) {
    record('⑦ 技术文档 PDF', false, 'docs/技术文档.pdf 不存在，运行 npm run pdf');
    return;
  }
  const buf = fs.readFileSync(pdf);
  const text = buf.toString('latin1');
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  const pages = counts.length ? Math.max(...counts) : 0;
  const kb = Math.round(buf.length / 1024);
  record('⑦ 技术文档 PDF（≤30 页）', pages > 0 && pages <= 30, `${pages} 页 / ${kb} KB`);
}

/* ---------------- 8. 服务健康（可选） ---------------- */
async function checkServer() {
  const probe = async (p) => {
    const res = await fetch('http://localhost:3000' + p, { signal: AbortSignal.timeout(2500) });
    return res.status;
  };
  let up = false;
  try {
    up = (await probe('/health')) === 200;
  } catch (e) {
    up = false;
  }
  if (!up) {
    record('⑧ 服务运行状态', true, '后端未启动（提交前请用 启动网站.bat 起一次）', 'SKIP');
    return;
  }
  const checks = [
    ['/health', 200],
    ['/api/content/heritage', 200],
    ['/api/projects', 200],
    ['/api/ai/tools', 200],
    ['/api/mcp', 200],
  ];
  const bad = [];
  for (const [p, want] of checks) {
    try {
      const code = await probe(p);
      if (code !== want) bad.push(`${p} → ${code}`);
    } catch (e) {
      bad.push(`${p} → 超时`);
    }
  }
  record('⑧ 关键接口', bad.length === 0, bad.length ? bad.join('，') : `${checks.length} 个接口全部 200`);
}

/* ---------------- 输出 ---------------- */
(async () => {
  console.log('══════════ 非遗共创平台 · 自检 ══════════\n');
  checkAssets();
  checkLint();
  checkFormat();
  checkTypes();
  checkTests();
  checkEval();
  checkPdf();
  await checkServer();

  const fail = results.filter((r) => !r.ok);
  const skip = results.filter((r) => r.status === 'SKIP');
  console.log('\n══════════ 汇总 ══════════');
  console.log(`通过 ${results.length - fail.length - skip.length} 项，跳过 ${skip.length} 项，失败 ${fail.length} 项`);
  if (fail.length) {
    console.log('\n失败项：');
    for (const f of fail) console.log(`  ❌ ${f.name} — ${f.detail}`);
  }
  console.log(fail.length ? '\n结论：未通过，请修完再提交' : '\n结论：全部通过 ✅');
  process.exit(fail.length ? 1 : 0);
})();
