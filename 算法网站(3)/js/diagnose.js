// diagnose.js —— 环境自检页：一眼看出"页面加载不出来"到底断在哪一步
document.addEventListener('DOMContentLoaded', async function () {
    if (typeof renderSiteHeader === 'function') renderSiteHeader('');
    if (typeof renderSiteFooter === 'function') renderSiteFooter();

    const root = document.getElementById('diag-root');
    root.innerHTML = '<p style="color:var(--muted);">正在检查…</p>';

    const results = [];
    const add = (level, title, desc, fix) => results.push({ level, title, desc, fix });

    /* 1. 页面是怎么打开的 */
    const proto = location.protocol;
    const host = location.host || '(本地文件)';
    if (proto === 'file:') {
        add('warn', '你正在用 file:// 直接打开本地文件',
            `当前地址：<code>${location.href.slice(0, 70)}…</code><br>这种方式下浏览器可能拦截跨域请求，后端数据会加载不出来。`,
            '启动后端后，打开 <a href="http://localhost:3000/html/diagnose.html">http://localhost:3000/html/diagnose.html</a>。');
    } else {
        add('ok', '页面通过 HTTP 打开', `当前地址：<code>${proto}//${host}</code>，协议正常。`);
    }

    /* 2. api.js 是否加载成功 */
    if (typeof window.API === 'object' && window.API !== null) {
        add('ok', 'api.js 已加载', `接口封装可用，共 ${Object.keys(window.API).length} 个模块：${Object.keys(window.API).join('、')}`);
    } else {
        add('bad', 'api.js 没有加载', '页面上 <code>window.API</code> 是 undefined，所有需要后端的功能都会失效。',
            '检查该页面是否引入了 <code>&lt;script src="../js/api.js"&gt;&lt;/script&gt;</code>（要放在页面自己的 js 之前）。');
    }

    /* 3. 后端是否连通 */
    const base = window.API_BASE_URL || '(未知)';
    let backendOk = false;
    const t0 = Date.now();
    try {
        const r = await fetch(base.replace(/\/api$/, '') + '/health', { cache: 'no-store' });
        const j = await r.json();
        backendOk = r.ok && j.status === 'ok';
        add(backendOk ? 'ok' : 'bad', '后端服务连通性',
            `请求 <code>${base.replace(/\/api$/, '')}/health</code> → HTTP ${r.status}，耗时 ${Date.now() - t0}ms`,
            backendOk ? null : '后端启动了但返回异常，看后端终端有没有报错。');
    } catch (e) {
        add('bad', '连不上后端服务',
            `请求 <code>${base.replace(/\/api$/, '')}/health</code> 失败：${e.message}`,
            '请在 <code>backend</code> 目录执行 <code>npm start</code>（或双击 start.bat），看到"服务器运行在 http://localhost:3000"后再刷新本页。');
    }

    /* 4. 关键接口是否可用 */
    if (backendOk && typeof window.API === 'object') {
        const checks = [
            ['非遗分类', () => window.API.content.categories()],
            ['非遗项目', () => window.API.content.heritage({ pageSize: 3 })],
            ['共创项目', () => window.API.projects.list({ pageSize: 3 })],
            ['作品列表', () => window.API.works.list({ pageSize: 3 })],
            ['活动列表', () => window.API.content.events()],
        ];
        for (const [name, fn] of checks) {
            try {
                const d = await fn();
                const n = Array.isArray(d) ? d.length : d && d.total !== undefined ? d.total : 'ok';
                add('ok', `接口可用：${name}`, `返回 ${n} 条`);
            } catch (e) {
                add('bad', `接口异常：${name}`, `${e.message}（HTTP ${e.status || '?'}）`,
                    e.status === 404 ? '后端是旧版本？请确认 backend 目录里是 v2 的 routes（有 content/projects/community 等）。' : null);
            }
        }
    } else {
        add('warn', '已跳过接口检查', '后端未连通，接口检查无法进行。');
    }

    /* 5. 数据库是否灌过数据 */
    if (backendOk && typeof window.API === 'object') {
        try {
            const c = await window.API.content.categories();
            const p = await window.API.projects.list({ pageSize: 1 });
            if (Array.isArray(c) && c.length > 0 && p.total > 0) {
                add('ok', '数据库已有演示数据', `${c.length} 个分类、${p.total} 个共创项目`);
            } else {
                add('bad', '数据库是空的', `分类 ${c.length} 个、共创项目 ${p.total} 个`,
                    '在 backend 目录依次执行：<code>npm run seed</code> → <code>npm run demo</code>');
            }
        } catch (e) {
            add('warn', '数据检查失败', e.message);
        }
    }

    /* 6. 登录状态 */
    const token = localStorage.getItem('henanICHToken');
    const cached = (() => { try { return JSON.parse(localStorage.getItem('henanICHCurrentUser') || 'null'); } catch { return null; } })();

    if (!token) {
        add('warn', '当前未登录', '浏览类页面不受影响；投稿、申请加入、点赞、收藏、后台管理都需要登录。',
            '用 <code>admin</code> / <code>creator</code> / <code>designer</code> / <code>writer</code> / <code>user</code>，密码都是 <code>123456</code>。');
    } else {
        try {
            const me = await window.API.auth.me();
            add('ok', '登录状态有效', `当前用户：<b>${me.displayName || me.username}</b>（角色：${me.role}，认证：${me.certStatus}）`);
            if (me.role !== 'admin') {
                add('warn', '当前账号不是管理员', '访问 <code>admin.html</code> 会被拒绝（这是设计如此）。',
                    '需要看后台请用 <code>admin</code> / <code>123456</code> 登录。');
            }
        } catch (e) {
            add('bad', '登录状态已失效', `本地有 token，但 <code>/auth/me</code> 返回错误：${e.message}`,
                '可能是后端重启后 JWT_SECRET 变了，或被禁用。请<a href="login.html">重新登录</a>。');
        }
        if (cached && !cached.role) {
            add('warn', '本地缓存的用户信息是旧格式', '可能来自改造前的版本。',
                '退出登录后重新登录一次即可。');
        }
    }

    /* 7. 前端脚本完整性 */
    const need = ['renderSiteHeader', 'renderSiteFooter', 'showToast', 'getUserData'];
    const miss = need.filter((n) => typeof window[n] !== 'function');
    if (miss.length === 0) {
        add('ok', 'script.js 公共函数齐全', '导航、页脚、提示、登录态读取都可用。');
    } else {
        add('bad', 'script.js 缺函数', `缺少：${miss.join('、')}`, '确认页面引入了 <code>../js/script.js</code> 且没有被缓存成旧版本（Ctrl+F5 强刷）。');
    }

    /* 渲染结果 */
    const levelIcon = { ok: 'fa-check', bad: 'fa-xmark', warn: 'fa-exclamation' };
    const badCount = results.filter((r) => r.level === 'bad').length;
    const warnCount = results.filter((r) => r.level === 'warn').length;

    root.innerHTML = `
        <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:1.1rem 1.3rem;margin-bottom:1.2rem;">
            <div style="font-family:var(--font-serif);font-size:1.15rem;color:var(--ink);">
                ${badCount === 0 ? (warnCount === 0 ? '✅ 环境正常，所有检查通过' : `⚠️ 有 ${warnCount} 项提示需要注意`) : `❌ 发现 ${badCount} 个阻断问题`}
            </div>
            <button class="btn btn-sm" onclick="location.reload()" style="margin-left:auto;"><i class="fas fa-rotate"></i> 重新检查</button>
        </div>
        ${results.map((r) => `
            <div class="dg-item ${r.level}">
                <div class="dg-icon"><i class="fas ${levelIcon[r.level]}"></i></div>
                <div class="dg-body">
                    <div class="dg-title">${r.title}</div>
                    <div class="dg-desc">${r.desc}</div>
                    ${r.fix ? `<div class="dg-fix"><b>怎么办：</b>${r.fix}</div>` : ''}
                </div>
            </div>`).join('')}
        <div class="dg-item" style="display:block;">
            <div class="dg-title" style="margin-bottom:.6rem;"><i class="fas fa-list"></i> 各页面依赖速查</div>
            <div class="dg-desc" style="line-height:1.9;">
                纯静态页面（不需要后端，一定能打开）：<code>index.html</code>、<code>projects.html</code>、<code>project-detail.html</code>、<code>inheritors.html</code>、<code>gallery.html</code>、<code>about.html</code><br>
                需要后端：<code>co-projects.html</code>、<code>co-project-detail.html</code>、<code>my-workspace.html</code>、<code>admin.html</code>、<code>co-create.html</code>、<code>events.html</code>、<code>profile.html</code>、<code>login.html</code>、<code>register.html</code><br>
                跳转占位页（会自动跳到新地址，不是坏了）：<code>algorithms.html</code>、<code>algorithm-detail.html</code>
            </div>
        </div>
    `;
});
