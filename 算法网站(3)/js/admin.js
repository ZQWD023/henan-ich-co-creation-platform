// admin.js —— 平台管理后台（数据看板 / 作品审核 / 传承人认证 / 用户管理 / 评论治理 / 操作日志）
// 全部接口要求 admin 角色，后端 requireRole('admin') 拦截；前端这里只做体验层守卫
const AD = {
    tab: 'dash',
    works: { page: 1, pageSize: 10, status: 'pending', total: 0 },
    users: { page: 1, pageSize: 10, keyword: '', role: '', status: '', total: 0 },
    comments: { page: 1, pageSize: 10, total: 0 },
    certs: { page: 1, pageSize: 10, total: 0 },
    stats: null,
};

document.addEventListener('DOMContentLoaded', async function () {
    coInjectStyle();
    if (typeof renderSiteHeader === 'function') renderSiteHeader('admin');
    if (typeof renderSiteFooter === 'function') renderSiteFooter();

    if (!guard()) return;
    renderShell();
    await loadDash();
    await refreshBadges();
});

/* ==================== 权限守卫 ==================== */
function guard() {
    const u = typeof getUserData === 'function' ? getUserData() : null;
    const root = document.getElementById('admin-root');

    if (!u) {
        root.innerHTML = `<div class="ad-lock">
            <i class="fas fa-user-lock"></i>
            <h3 style="font-family:var(--font-serif);color:var(--ink-2);margin-bottom:.5rem;">请先登录</h3>
            <p style="color:var(--muted);font-size:.9rem;margin-bottom:1.2rem;">管理后台仅对平台管理员开放</p>
            <a class="co-btn co-btn-primary" href="login.html?redirect=${encodeURIComponent(location.href)}">去登录</a>
        </div>`;
        return false;
    }

    if (u.role !== 'admin') {
        root.innerHTML = `<div class="ad-lock">
            <i class="fas fa-ban"></i>
            <h3 style="font-family:var(--font-serif);color:var(--ink-2);margin-bottom:.5rem;">没有访问权限</h3>
            <p style="color:var(--muted);font-size:.9rem;margin-bottom:.4rem;">当前账号角色：<b>${coEsc(u.role)}</b>，管理后台需要 <b>admin</b> 角色</p>
            <p style="color:var(--muted);font-size:.82rem;margin-bottom:1.2rem;">演示时可使用账号 <code>admin</code> / 密码 <code>123456</code> 登录</p>
            <a class="co-btn co-btn-primary" href="login.html?redirect=${encodeURIComponent(location.href)}">切换账号</a>
        </div>`;
        return false;
    }
    return true;
}

/* ==================== 页面骨架 ==================== */
function renderShell() {
    document.getElementById('admin-root').innerHTML = `
        <div class="ad-tabs" id="ad-tabs">
            <button class="ad-tab active" data-tab="dash"><i class="fas fa-chart-line"></i> 数据看板</button>
            <button class="ad-tab" data-tab="works"><i class="fas fa-clipboard-check"></i> 作品审核 <span class="num" id="badge-works" style="display:none;">0</span></button>
            <button class="ad-tab" data-tab="certs"><i class="fas fa-certificate"></i> 传承人认证 <span class="num" id="badge-certs" style="display:none;">0</span></button>
            <button class="ad-tab" data-tab="users"><i class="fas fa-users-gear"></i> 用户管理</button>
            <button class="ad-tab" data-tab="comments"><i class="fas fa-comments"></i> 评论治理</button>
            <button class="ad-tab" data-tab="logs"><i class="fas fa-clock-rotate-left"></i> 操作日志</button>
        </div>
        <div class="ad-panel active" id="panel-dash"></div>
        <div class="ad-panel" id="panel-works"></div>
        <div class="ad-panel" id="panel-certs"></div>
        <div class="ad-panel" id="panel-users"></div>
        <div class="ad-panel" id="panel-comments"></div>
        <div class="ad-panel" id="panel-logs"></div>`;

    document.getElementById('ad-tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.ad-tab');
        if (btn) switchTab(btn.dataset.tab);
    });
}

function switchTab(tab) {
    AD.tab = tab;
    document.querySelectorAll('.ad-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.ad-panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));

    const loaders = {
        dash: loadDash,
        works: loadWorks,
        certs: loadCerts,
        users: loadUsers,
        comments: loadComments,
        logs: loadLogs,
    };
    if (loaders[tab]) loaders[tab]();
}

/* ==================== 1. 数据看板 ==================== */
async function loadDash() {
    const el = document.getElementById('panel-dash');
    el.innerHTML = coSkeleton(140) + `<div style="height:1rem"></div>` + coSkeleton(120);

    try {
        const [s, trend] = await Promise.all([
            window.API.admin.stats(),
            window.API.admin.stats.trend ? window.API.admin.stats.trend(7) : window.API.admin.trend(7),
        ]);
        AD.stats = s;

        el.innerHTML = `
            <div class="ad-cards">
                ${card('用户总数', s.users.total, `今日新增 ${s.users.newToday} · 创作者 ${s.users.creators}`)}
                ${card('作品总数', s.works.total, `已通过 ${s.works.approved} · 待审 ${s.works.pending}`)}
                ${card('共创项目', s.projects.total, `招募 ${s.projects.recruiting} · 协作中 ${s.projects.inProgress} · 已结项 ${s.projects.closed}`)}
                ${card('互动总数', s.interactions.likes + s.interactions.favorites + s.interactions.comments, `赞 ${s.interactions.likes} · 藏 ${s.interactions.favorites} · 评 ${s.interactions.comments}`)}
                ${card('内容资源', s.content.heritage, `${s.content.categories} 个分类 · ${s.content.inheritors} 位传承人 · ${s.content.materials} 份素材`)}
                ${card('累计浏览', s.traffic.workViews + s.traffic.projectViews, `作品 ${s.traffic.workViews} · 项目 ${s.traffic.projectViews}`)}
            </div>

            <div class="ad-box">
                <h3><span><i class="fas fa-chart-simple"></i> 近 7 天新增趋势</span>
                    <span style="font-size:.76rem;color:var(--muted);font-weight:400;">数据更新于 ${coEsc(s.updatedAt || '')}</span>
                </h3>
                ${trendChart(trend)}
            </div>

            <div class="ad-box">
                <h3><span><i class="fas fa-bolt"></i> 待处理事项</span></h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;">
                    ${todoCard('待审作品', s.works.pending, 'works', 'fa-clipboard-check')}
                    ${todoCard('待审认证', s.users.pendingCert, 'certs', 'fa-certificate')}
                    ${todoCard('驳回作品', s.works.total - s.works.approved - s.works.pending - s.works.offline, 'works', 'fa-circle-xmark')}
                </div>
            </div>`;
    } catch (err) {
        el.innerHTML = coErrorPanel(err, '看板加载失败', '后台数据');
    }
}

function card(k, v, sub) {
    return `<div class="ad-card"><div class="k">${coEsc(k)}</div><div class="v">${v}</div><div class="sub">${coEsc(sub)}</div></div>`;
}

function todoCard(label, num, tab, icon) {
    const color = num > 0 ? 'var(--warning)' : 'var(--muted)';
    return `<div style="border:1px dashed var(--border);border-radius:var(--radius);padding:.9rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:.6rem;cursor:pointer;" onclick="switchTab('${tab}')">
        <div><div style="font-size:.82rem;color:var(--muted);">${coEsc(label)}</div>
        <div style="font-family:var(--font-serif);font-size:1.5rem;font-weight:700;color:${color};">${num < 0 ? 0 : num}</div></div>
        <i class="fas ${icon}" style="font-size:1.3rem;color:var(--paper-3);"></i>
    </div>`;
}

function trendChart(trend) {
    if (!trend || !trend.length) return '<p style="color:var(--muted);font-size:.86rem;">暂无趋势数据</p>';

    const series = [
        { key: 'users', color: 'var(--primary)', name: '新增用户' },
        { key: 'works', color: 'var(--gold)', name: '新增作品' },
        { key: 'projects', color: 'var(--blue)', name: '新增项目' },
        { key: 'comments', color: 'var(--jade)', name: '新增评论' },
    ];
    const max = Math.max(1, ...trend.flatMap((d) => series.map((s) => d[s.key] || 0)));

    const bars = trend.map((d) => {
        const bs = series.map((s) => {
            const v = d[s.key] || 0;
            const h = Math.round((v / max) * 100);
            return `<div class="ad-bar" title="${s.name}：${v}" style="height:${Math.max(h, 2)}%;background:${s.color};"></div>`;
        }).join('');
        return `<div class="ad-day">
            <div class="ad-bars">${bs}</div>
            <div class="lab">${coEsc((d.date || '').slice(5))}</div>
        </div>`;
    }).join('');

    return `<div class="ad-chart">${bars}</div>
        <div class="ad-legend">
            ${series.map((s) => `<span><i style="background:${s.color};"></i>${s.name}</span>`).join('')}
        </div>`;
}

/* ==================== 2. 作品审核 ==================== */
async function loadWorks() {
    const el = document.getElementById('panel-works');
    el.innerHTML = coSkeleton(120);

    const statuses = [
        ['pending', '待审核'],
        ['approved', '已通过'],
        ['rejected', '已驳回'],
        ['offline', '已下架'],
    ];

    try {
        const data = await window.API.admin.works({
            status: AD.works.status,
            page: AD.works.page,
            pageSize: AD.works.pageSize,
        });
        AD.works.total = data.total;
        const list = data.list || [];

        el.innerHTML = `
            <div class="ad-box">
                <h3><span><i class="fas fa-clipboard-check"></i> 作品审核队列</span>
                    <span style="font-size:.78rem;color:var(--muted);font-weight:400;">共 ${data.total} 件</span>
                </h3>
                <div class="ad-filters">
                    <select onchange="AD.works.status=this.value;AD.works.page=1;loadWorks()">
                        ${statuses.map(([v, t]) => `<option value="${v}" ${AD.works.status === v ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                </div>
                ${list.length ? `<table class="ad-table">
                    <thead><tr><th>作品</th><th>作者</th><th>类型</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead>
                    <tbody>${list.map(workRow).join('')}</tbody>
                </table>${pager(AD.works, 'loadWorks')}` : coEmpty('fa-circle-check', '这个队列是空的', '没有需要处理的 ' + (statuses.find((s) => s[0] === AD.works.status) || ['', ''])[1] + ' 作品')}
            </div>`;
    } catch (err) {
        el.innerHTML = coEmpty('fa-plug-circle-xmark', '加载失败', err.message || '');
    }
}

function workRow(w) {
    const st = { pending: ['待审核', 'var(--warning)'], approved: ['已通过', 'var(--success)'], rejected: ['已驳回', 'var(--danger)'], offline: ['已下架', 'var(--muted)'], draft: ['草稿', 'var(--muted)'] }[w.status] || [w.status, 'var(--muted)'];
    return `<tr>
        <td><div class="ad-mini"><div><div class="nm">${coEsc(w.title)}</div>
            <div class="sub">${coEsc((w.summary || '').slice(0, 40))}</div></div></div></td>
        <td>${coEsc(w.display_name || w.username || '—')}</td>
        <td>${coEsc(w.work_type || '—')}</td>
        <td><span class="co-badge" style="color:${st[1]};background:rgba(0,0,0,.04);">${st[0]}</span></td>
        <td>${coDate(w.created_at)}</td>
        <td><div class="ad-actions">
            ${w.status !== 'approved' ? `<button class="co-btn co-btn-primary co-btn-sm" onclick="auditWork('${w.id}','approve')">通过</button>` : ''}
            ${w.status !== 'rejected' ? `<button class="co-btn co-btn-ghost co-btn-sm" onclick="auditWork('${w.id}','reject')">驳回</button>` : ''}
            ${w.status === 'approved' ? `<button class="co-btn co-btn-ghost co-btn-sm" style="color:var(--danger);" onclick="auditWork('${w.id}','offline')">下架</button>` : ''}
        </div></td>
    </tr>`;
}

async function auditWork(id, decision) {
    let note = '';
    if (decision === 'reject' || decision === 'offline') {
        note = window.prompt(decision === 'reject' ? '请填写驳回原因（会通知作者）：' : '请填写下架原因：') || '';
        if (!note) return showToast('已取消：需要填写原因', 'info');
    }
    try {
        await window.API.admin.auditWork(id, decision, note);
        showToast(decision === 'approve' ? '已通过' : decision === 'reject' ? '已驳回' : '已下架');
        await loadWorks();
        await refreshBadges();
    } catch (err) {
        coHandleError(err, '审核失败');
    }
}

/* ==================== 3. 传承人认证 ==================== */
async function loadCerts() {
    const el = document.getElementById('panel-certs');
    el.innerHTML = coSkeleton(120);
    try {
        const data = await window.API.admin.certifications({ page: AD.certs.page, pageSize: AD.certs.pageSize });
        AD.certs.total = data.total;
        const list = data.list || [];
        el.innerHTML = `<div class="ad-box">
            <h3><span><i class="fas fa-certificate"></i> 待审核的传承人认证</span>
                <span style="font-size:.78rem;color:var(--muted);font-weight:400;">共 ${data.total} 条</span></h3>
            ${list.length ? `<table class="ad-table">
                <thead><tr><th>申请人</th><th>真实姓名</th><th>申报级别</th><th>称号</th><th>提交时间</th><th>操作</th></tr></thead>
                <tbody>${list.map((c) => `<tr>
                    <td><div class="nm">${coEsc(c.display_name || c.username)}</div></td>
                    <td>${coEsc(c.real_name)}</td>
                    <td>${coEsc(c.level || '—')}</td>
                    <td>${coEsc(c.title || '—')}</td>
                    <td>${coDate(c.created_at)}</td>
                    <td><div class="ad-actions">
                        <button class="co-btn co-btn-primary co-btn-sm" onclick="reviewCert('${c.id}','approved')">通过</button>
                        <button class="co-btn co-btn-ghost co-btn-sm" onclick="reviewCert('${c.id}','rejected')">驳回</button>
                    </div></td></tr>`).join('')}</tbody>
            </table>${pager(AD.certs, 'loadCerts')}` : coEmpty('fa-certificate', '没有待审核的认证', '所有申请都已处理完毕')}
        </div>`;
    } catch (err) {
        el.innerHTML = coEmpty('fa-plug-circle-xmark', '加载失败', err.message || '');
    }
}

async function reviewCert(id, decision) {
    let note = '';
    if (decision === 'rejected') {
        note = window.prompt('请填写驳回原因（会通知申请人）：') || '';
        if (!note) return showToast('已取消：需要填写原因', 'info');
    }
    try {
        await window.API.admin.reviewCertification(id, decision, note);
        showToast(decision === 'approved' ? '已通过，该用户已升级为创作者' : '已驳回');
        await loadCerts();
        await refreshBadges();
    } catch (err) {
        coHandleError(err, '操作失败');
    }
}

/* ==================== 4. 用户管理 ==================== */
async function loadUsers() {
    const el = document.getElementById('panel-users');
    el.innerHTML = coSkeleton(120);
    try {
        const data = await window.API.admin.users({
            keyword: AD.users.keyword || undefined,
            role: AD.users.role || undefined,
            status: AD.users.status || undefined,
            page: AD.users.page,
            pageSize: AD.users.pageSize,
        });
        AD.users.total = data.total;
        const list = data.list || [];

        el.innerHTML = `<div class="ad-box">
            <h3><span><i class="fas fa-users-gear"></i> 用户列表</span>
                <span style="font-size:.78rem;color:var(--muted);font-weight:400;">共 ${data.total} 人</span></h3>
            <div class="ad-filters">
                <input id="u-kw" placeholder="搜索用户名/昵称/邮箱" value="${coEsc(AD.users.keyword)}" style="min-width:200px;">
                <select id="u-role">
                    <option value="">全部角色</option>
                    ${[['user', '普通用户'], ['creator', '创作者/传承人'], ['admin', '管理员']].map(([v, t]) => `<option value="${v}" ${AD.users.role === v ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                <select id="u-status">
                    <option value="">全部状态</option>
                    ${[['active', '正常'], ['banned', '已封禁']].map(([v, t]) => `<option value="${v}" ${AD.users.status === v ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                <button class="co-btn co-btn-primary co-btn-sm" onclick="applyUserFilter()">筛选</button>
                <button class="co-btn co-btn-ghost co-btn-sm" onclick="resetUserFilter()">重置</button>
            </div>
            ${list.length ? `<table class="ad-table">
                <thead><tr><th>用户</th><th>邮箱</th><th>角色</th><th>认证</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead>
                <tbody>${list.map(userRow).join('')}</tbody>
            </table>${pager(AD.users, 'loadUsers')}` : coEmpty('fa-user-slash', '没有符合条件的用户', '')}
        </div>`;

        const kw = document.getElementById('u-kw');
        if (kw) kw.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyUserFilter(); });
    } catch (err) {
        el.innerHTML = coEmpty('fa-plug-circle-xmark', '加载失败', err.message || '');
    }
}

const ROLE_TEXT = { user: ['普通用户', 'var(--muted)'], creator: ['创作者/传承人', 'var(--jade)'], admin: ['管理员', 'var(--primary)'] };
const CERT_TEXT = { none: '未认证', pending: '审核中', approved: '已认证', rejected: '已驳回' };

function userRow(u) {
    const r = ROLE_TEXT[u.role] || [u.role, 'var(--muted)'];
    const banned = u.status === 'banned';
    return `<tr>
        <td><div class="ad-mini">${coAvatar({ displayName: u.display_name || u.username, avatar: u.avatar }, 28)}
            <div><div class="nm">${coEsc(u.display_name || u.username)}</div>
            <div class="sub">@${coEsc(u.username)}</div></div></div></td>
        <td>${coEsc(u.email || '—')}</td>
        <td><span class="co-badge" style="color:${r[1]};background:rgba(0,0,0,.04);">${r[0]}</span></td>
        <td style="font-size:.8rem;color:var(--muted);">${coEsc(CERT_TEXT[u.cert_status] || u.cert_status)}</td>
        <td><span class="co-badge" style="color:${banned ? 'var(--danger)' : 'var(--success)'};background:rgba(0,0,0,.04);">${banned ? '已封禁' : '正常'}</span></td>
        <td>${coDate(u.joined_date)}</td>
        <td><div class="ad-actions">
            ${u.role !== 'admin' ? (banned
                ? `<button class="co-btn co-btn-primary co-btn-sm" onclick="setUserStatus('${u.id}','active')">解封</button>`
                : `<button class="co-btn co-btn-ghost co-btn-sm" style="color:var(--danger);" onclick="setUserStatus('${u.id}','banned')">封禁</button>`) : '<span style="font-size:.76rem;color:var(--muted);">—</span>'}
            ${u.role === 'user' ? `<button class="co-btn co-btn-ghost co-btn-sm" onclick="setUserRole('${u.id}','creator')">升为创作者</button>` : ''}
            ${u.role === 'creator' ? `<button class="co-btn co-btn-ghost co-btn-sm" onclick="setUserRole('${u.id}','user')">降为普通</button>` : ''}
        </div></td>
    </tr>`;
}

function applyUserFilter() {
    AD.users.keyword = document.getElementById('u-kw').value.trim();
    AD.users.role = document.getElementById('u-role').value;
    AD.users.status = document.getElementById('u-status').value;
    AD.users.page = 1;
    loadUsers();
}

function resetUserFilter() {
    AD.users = { page: 1, pageSize: 10, keyword: '', role: '', status: '', total: 0 };
    loadUsers();
}

async function setUserStatus(id, status) {
    const label = status === 'banned' ? '封禁' : '解封';
    showConfirmDialog(label + '账号', `确定要${label}该账号吗？`, async () => {
        try {
            await window.API.admin.setUserStatus(id, status);
            showToast(`已${label}`);
            await loadUsers();
        } catch (err) {
            coHandleError(err, `${label}失败`);
        }
    });
}

async function setUserRole(id, role) {
    try {
        await window.API.admin.setUserRole(id, role);
        showToast('角色已调整');
        await loadUsers();
    } catch (err) {
        coHandleError(err, '调整失败');
    }
}

/* ==================== 5. 评论治理 ==================== */
async function loadComments() {
    const el = document.getElementById('panel-comments');
    el.innerHTML = coSkeleton(120);
    try {
        const data = await window.API.admin.comments({ page: AD.comments.page, pageSize: AD.comments.pageSize });
        AD.comments.total = data.total;
        const list = data.list || [];
        el.innerHTML = `<div class="ad-box">
            <h3><span><i class="fas fa-comments"></i> 全部评论</span>
                <span style="font-size:.78rem;color:var(--muted);font-weight:400;">共 ${data.total} 条</span></h3>
            ${list.length ? `<table class="ad-table">
                <thead><tr><th>内容</th><th>作者</th><th>对象</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
                <tbody>${list.map((c) => `<tr>
                    <td style="max-width:360px;">${coEsc((c.content || '').slice(0, 80))}</td>
                    <td>${coEsc(c.display_name || c.username || '—')}</td>
                    <td style="font-size:.78rem;color:var(--muted);">${coEsc(c.target_type)} / ${coEsc((c.target_id || '').slice(0, 14))}</td>
                    <td><span class="co-badge" style="color:${c.status === 'visible' ? 'var(--success)' : c.status === 'hidden' ? 'var(--warning)' : 'var(--muted)'};background:rgba(0,0,0,.04);">${c.status === 'visible' ? '正常' : c.status === 'hidden' ? '已隐藏' : '已删除'}</span></td>
                    <td>${coDate(c.created_at)}</td>
                    <td>${c.status === 'visible' ? `<button class="co-btn co-btn-ghost co-btn-sm" style="color:var(--danger);" onclick="hideComment('${c.id}')">隐藏</button>` : '<span style="font-size:.76rem;color:var(--muted);">—</span>'}</td>
                </tr>`).join('')}</tbody>
            </table>${pager(AD.comments, 'loadComments')}` : coEmpty('fa-comment-slash', '暂无评论', '')}
        </div>`;
    } catch (err) {
        el.innerHTML = coEmpty('fa-plug-circle-xmark', '加载失败', err.message || '');
    }
}

async function hideComment(id) {
    showConfirmDialog('隐藏评论', '确定隐藏这条评论吗？用户将无法看到。', async () => {
        try {
            await window.API.admin.hideComment(id);
            showToast('评论已隐藏');
            await loadComments();
        } catch (err) {
            coHandleError(err, '操作失败');
        }
    });
}

/* ==================== 6. 操作日志 ==================== */
async function loadLogs() {
    const el = document.getElementById('panel-logs');
    el.innerHTML = coSkeleton(120);
    try {
        const list = await window.API.admin.auditLogs(50);
        el.innerHTML = `<div class="ad-box">
            <h3><span><i class="fas fa-clock-rotate-left"></i> 管理员操作留痕</span>
                <span style="font-size:.78rem;color:var(--muted);font-weight:400;">最近 ${(list || []).length} 条</span></h3>
            ${(list && list.length) ? `<table class="ad-table">
                <thead><tr><th>时间</th><th>对象类型</th><th>对象 ID</th><th>动作</th><th>备注</th></tr></thead>
                <tbody>${list.map((l) => `<tr>
                    <td>${coDate(l.created_at)}</td>
                    <td>${coEsc(l.target_type)}</td>
                    <td style="font-size:.78rem;color:var(--muted);">${coEsc((l.target_id || '').slice(0, 18))}</td>
                    <td><span class="co-badge" style="color:var(--ink-3);background:var(--paper-2);">${coEsc(l.action)}</span></td>
                    <td>${coEsc(l.note || '—')}</td>
                </tr>`).join('')}</tbody>
            </table>` : coEmpty('fa-clock', '还没有操作记录', '做一次审核/封禁后这里就会有留痕')}
        </div>`;
    } catch (err) {
        el.innerHTML = coEmpty('fa-plug-circle-xmark', '加载失败', err.message || '');
    }
}

/* ==================== 工具 ==================== */
function pager(obj, reloadFn) {
    const totalPages = Math.max(1, Math.ceil(obj.total / obj.pageSize));
    return `<div class="ad-pager">
        <span>第 ${obj.page} / ${totalPages} 页</span>
        <button class="co-btn co-btn-ghost co-btn-sm" ${obj.page <= 1 ? 'disabled' : ''} onclick="AD.pagePrev('${reloadFn}')">上一页</button>
        <button class="co-btn co-btn-ghost co-btn-sm" ${obj.page >= totalPages ? 'disabled' : ''} onclick="AD.pageNext('${reloadFn}')">下一页</button>
    </div>`;
}

AD.pagePrev = function (reloadFn) {
    const obj = reloadFn === 'loadWorks' ? AD.works : reloadFn === 'loadUsers' ? AD.users : reloadFn === 'loadComments' ? AD.comments : AD.certs;
    if (obj.page > 1) { obj.page -= 1; window[reloadFn](); }
};
AD.pageNext = function (reloadFn) {
    const obj = reloadFn === 'loadWorks' ? AD.works : reloadFn === 'loadUsers' ? AD.users : reloadFn === 'loadComments' ? AD.comments : AD.certs;
    const totalPages = Math.ceil(obj.total / obj.pageSize);
    if (obj.page < totalPages) { obj.page += 1; window[reloadFn](); }
};

/** 顶部 Tab 上的红点数字 */
async function refreshBadges() {
    try {
        const s = await window.API.admin.stats();
        const wb = document.getElementById('badge-works');
        const cb = document.getElementById('badge-certs');
        if (wb) { wb.textContent = s.works.pending; wb.style.display = s.works.pending ? 'inline-block' : 'none'; }
        if (cb) { cb.textContent = s.users.pendingCert; cb.style.display = s.users.pendingCert ? 'inline-block' : 'none'; }
    } catch (e) { /* 忽略 */ }
}
