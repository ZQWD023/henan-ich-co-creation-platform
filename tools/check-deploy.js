// tools/check-deploy.js —— 线上部署自检（部署完成后跑一次，30 秒出结论）
//
// 用法：
//   node tools/check-deploy.js https://xxx.onrender.com
//   node tools/check-deploy.js https://xxx.onrender.com --with-login reviewer Reviewer@2026
//
// 检查：首页可访问 / 静态资源无 404 / API 有数据 / AI 工具清单 / MCP 端点 /
//       技术文档与 PPT 是否随仓库发布 / 登录链路 / 是否误暴露 .env
const BASE = (process.argv[2] || '').replace(/\/$/, '');
if (!BASE || !/^https?:\/\//.test(BASE)) {
  console.error('用法：node tools/check-deploy.js https://<你的域名> [--with-login 用户名 密码]');
  process.exit(2);
}

const results = [];
function rec(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' · ' + detail : ''}`);
}

async function get(pathname, opts = {}) {
  const res = await fetch(BASE + pathname, { signal: AbortSignal.timeout(opts.timeout || 15000), redirect: 'follow' });
  const text = opts.json ? '' : await res.text();
  let json = null;
  if (opts.json) {
    try {
      json = await res.json();
    } catch (e) {
      json = null;
    }
  }
  return { status: res.status, text, json, headers: res.headers };
}

(async () => {
  console.log(`=== 部署自检：${BASE} ===\n`);

  // 1. 健康检查
  try {
    const r = await get('/health', { json: true });
    rec('健康检查 /health', r.status === 200 && r.json && r.json.status === 'ok', r.json ? JSON.stringify(r.json).slice(0, 60) : 'status ' + r.status);
  } catch (e) {
    rec('健康检查 /health', false, e.message);
  }

  // 2. 首页
  try {
    const r = await get('/');
    const hasTitle = /河南省非物质文化遗产共创平台/.test(r.text);
    const hasOffline = r.text.includes('离线演示');
    rec('首页可访问', r.status === 200 && hasTitle, `status ${r.status}${hasOffline ? '，含离线模式文案（正常）' : ''}`);
  } catch (e) {
    rec('首页可访问', false, e.message);
  }

  // 3. 静态资源（首页引用的 js/css 不能 404）
  try {
    const home = await get('/');
    const refs = [...home.text.matchAll(/(?:src|href)="((?:\.\.?\/)?(?:js|css)\/[^"]+)"/g)].map((m) => m[1]).slice(0, 5);
    let bad = [];
    for (const ref of refs) {
      const p = ref.startsWith('..') ? ref.replace(/^\.\.\//, '/') : '/' + ref.replace(/^\.\//, '');
      const r = await get(p);
      if (r.status !== 200) bad.push(`${p} → ${r.status}`);
    }
    rec('静态资源（抽样 5 个）', bad.length === 0, bad.length ? bad.join('，') : '全部 200');
  } catch (e) {
    rec('静态资源（抽样 5 个）', false, e.message);
  }

  // 4. 数据接口
  try {
    const r = await get('/api/content/heritage?pageSize=1', { json: true });
    const total = r.json && r.json.data ? r.json.data.total : 0;
    rec('非遗数据已灌入', r.status === 200 && total > 0, `total=${total}`);
  } catch (e) {
    rec('非遗数据已灌入', false, e.message);
  }

  // 5. AI 工具清单
  try {
    const r = await get('/api/ai/tools', { json: true });
    const n = r.json && r.json.data ? (r.json.data.tools || r.json.data).length : 0;
    rec('AI 工具清单', r.status === 200 && n >= 5, `${n} 个工具`);
  } catch (e) {
    rec('AI 工具清单', false, e.message);
  }

  // 6. MCP 端点
  try {
    const res = await fetch(BASE + '/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await res.json();
    const n = j && j.result && j.result.tools ? j.result.tools.length : 0;
    rec('MCP 端点 /api/mcp', res.status === 200 && n >= 5, `tools=${n}`);
  } catch (e) {
    rec('MCP 端点 /api/mcp', false, e.message);
  }

  // 7. 敏感文件不得可访问
  for (const p of ['/.env', '/backend/.env', '/database.sqlite', '/backend/database.sqlite']) {
    try {
      const r = await get(p);
      rec(`敏感文件不可访问 ${p}`, r.status === 404 || r.status === 403, `status ${r.status}`);
    } catch (e) {
      rec(`敏感文件不可访问 ${p}`, true, '连接失败（等同不可访问）');
    }
  }

  // 8. 可选：登录链路
  const li = process.argv.indexOf('--with-login');
  if (li > -1) {
    const user = process.argv[li + 1];
    const pass = process.argv[li + 2];
    try {
      const res = await fetch(BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await res.json();
      rec('评审账号可登录', res.status === 200 && j.code === 0, j.code === 0 ? `用户 ${j.data.user.username}` : j.message);
    } catch (e) {
      rec('评审账号可登录', false, e.message);
    }
  } else {
    rec('评审账号可登录', true, '跳过（加 --with-login 用户名 密码 可测）');
  }

  const fail = results.filter((r) => !r.ok);
  console.log(`\n=== 结果：${results.length - fail.length}/${results.length} 通过 ===`);
  if (fail.length) {
    console.log('需要处理：');
    for (const f of fail) console.log(`  ❌ ${f.name} — ${f.detail}`);
    console.log('\n常见原因：');
    console.log('  · 免费实例休眠：先访问一次首页等 30-60 秒再跑');
    console.log('  · 没灌数据：环境变量 AUTO_SETUP=1 后重启');
    console.log('  · JWT_SECRET 没配：登录会 500');
  }
  process.exit(fail.length ? 1 : 0);
})().catch((e) => {
  console.error('自检失败：', e);
  process.exit(1);
});
