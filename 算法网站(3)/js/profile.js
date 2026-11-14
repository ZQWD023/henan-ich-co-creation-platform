// profile.js - 个人中心页面

document.addEventListener('DOMContentLoaded', function () {
    renderSiteHeader('');
    renderSiteFooter();

    const user = getUserData();
    const root = document.getElementById('profile-root');

    if (!user) {
        root.innerHTML = `<div class="empty-state" style="padding:4rem 1rem;">
            <i class="fas fa-user-lock"></i>
            <h3>请先登录</h3>
            <p>登录后才能查看个人中心、收藏与投稿</p>
            <a href="login.html" class="btn">前往登录</a></div>`;
        return;
    }

    renderProfile(user);

    const target = new URLSearchParams(window.location.search).get('tab');
    if (target) switchTab(target);
});

function renderProfile(user) {
    const favCount = (user.favorites || []).length;
    const likeCount = (user.likes || []).length;
    const subCount = (user.submissions || []).length;
    const displayName = user.displayName || user.username;

    const root = document.getElementById('profile-root');
    root.innerHTML = `
    <div class="profile-content">
        <div class="profile-sidebar">
            <div class="profile-card">
                <div class="profile-avatar">
                    <svg class="avatar-svg" viewBox="0 0 100 100" width="110" height="110">
                        <defs>
                            <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#a3242c"/>
                                <stop offset="100%" style="stop-color:#c19a4b"/>
                            </linearGradient>
                        </defs>
                        <circle cx="50" cy="50" r="48" fill="url(#avatarGrad)" stroke="#f3ebdb" stroke-width="2"/>
                        <circle cx="50" cy="38" r="18" fill="rgba(255,255,255,0.92)"/>
                        <path d="M22 82 C22 62, 78 62, 78 82" fill="rgba(255,255,255,0.92)"/>
                    </svg>
                </div>
                <div class="profile-info">
                    <h2 id="p-name">${displayName}</h2>
                    <p id="p-email">${user.email || '未设置邮箱'}</p>
                    <p class="member-since">加入于 ${formatDate(user.joinedDate)}</p>
                </div>
                <div class="profile-stats">
                    <div class="stat-item"><div class="stat-value">${favCount}</div><div class="stat-label">收藏</div></div>
                    <div class="stat-item"><div class="stat-value">${likeCount}</div><div class="stat-label">点赞</div></div>
                    <div class="stat-item"><div class="stat-value">${subCount}</div><div class="stat-label">投稿</div></div>
                </div>
            </div>

            <div class="profile-menu">
                <h3><i class="fas fa-sliders"></i> 功能菜单</h3>
                <ul>
                    <li><a href="#" class="profile-menu-item active" data-tab="basic-info"><i class="fas fa-user"></i> 基本信息</a></li>
                    <li><a href="#" class="profile-menu-item" data-tab="favorites"><i class="fas fa-bookmark"></i> 我的收藏</a></li>
                    <li><a href="#" class="profile-menu-item" data-tab="submissions"><i class="fas fa-lightbulb"></i> 我的投稿</a></li>
                    <li><a href="#" class="profile-menu-item" data-tab="achievements"><i class="fas fa-trophy"></i> 成就勋章</a></li>
                    <li><a href="#" class="profile-menu-item" data-tab="account-settings"><i class="fas fa-key"></i> 账户设置</a></li>
                </ul>
            </div>
        </div>

        <div class="profile-main">
            <div id="basic-info" class="profile-tab active">
                <h2><i class="fas fa-user"></i> 基本信息</h2>
                <form id="basic-info-form" class="profile-form">
                    <div class="form-group">
                        <label for="p-display-name"><i class="fas fa-signature"></i> 显示名称</label>
                        <input type="text" id="p-display-name" class="form-control" value="${displayName}">
                        <small class="form-text">这是其他用户看到的名称</small>
                    </div>
                    <div class="form-group">
                        <label for="p-bio"><i class="fas fa-edit"></i> 个人简介</label>
                        <textarea id="p-bio" class="form-control" rows="4" placeholder="介绍一下你自己……">${user.bio || ''}</textarea>
                        <small class="form-text">最多200字</small>
                    </div>
                    <div class="form-actions" style="display:flex;gap:10px;">
                        <button type="submit" class="btn">保存更改</button>
                    </div>
                </form>
            </div>

            <div id="favorites" class="profile-tab">
                <h2><i class="fas fa-bookmark"></i> 我的收藏</h2>
                <div id="favorites-list"></div>
            </div>

            <div id="submissions" class="profile-tab">
                <h2><i class="fas fa-lightbulb"></i> 我的投稿</h2>
                <div id="submissions-list"></div>
            </div>

            <div id="achievements" class="profile-tab">
                <h2><i class="fas fa-trophy"></i> 成就勋章</h2>
                <div id="ach-stats" class="achievements-stats" style="display:flex;justify-content:space-around;margin-bottom:1.5rem;padding:1.5rem;background:var(--paper);border-radius:var(--radius);"></div>
                <div class="achievements-grid" id="ach-grid"></div>
            </div>

            <div id="account-settings" class="profile-tab">
                <h2><i class="fas fa-key"></i> 账户设置</h2>
                <div class="settings-section">
                    <h3><i class="fas fa-lock"></i> 修改密码</h3>
                    <form id="change-password-form">
                        <div class="form-group"><label for="current-password">当前密码</label><input type="password" id="current-password" class="form-control" required></div>
                        <div class="form-group"><label for="new-password">新密码</label><input type="password" id="new-password" class="form-control" required><small class="form-text">密码长度至少6位</small></div>
                        <div class="form-group"><label for="confirm-new-password">确认新密码</label><input type="password" id="confirm-new-password" class="form-control" required></div>
                        <div class="form-actions" style="display:flex;gap:10px;"><button type="submit" class="btn">修改密码</button></div>
                    </form>
                </div>
                <div class="settings-section danger-zone" style="margin-top:1.5rem;">
                    <h3><i class="fas fa-exclamation-triangle"></i> 危险区域</h3>
                    <div class="danger-actions">
                        <div class="danger-action">
                            <h4>清除我的数据</h4>
                            <p>清除收藏、点赞与投稿记录（保留账户）。</p>
                            <button class="btn btn-outline" id="clear-data" style="border-color:var(--warning);color:var(--warning);">清除数据</button>
                        </div>
                        <div class="danger-action">
                            <h4>删除账户</h4>
                            <p>永久删除账户和所有相关数据，此操作不可撤销。</p>
                            <button class="btn btn-outline" id="delete-account" style="border-color:var(--danger);color:var(--danger);">删除账户</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    bindEvents(user);
    renderFavorites(user);
    renderSubmissions(user);
    renderAchievements(user);
}

function bindEvents(user) {
    // 菜单切换
    document.querySelectorAll('.profile-menu-item').forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            switchTab(this.getAttribute('data-tab'));
        });
    });

    // 保存基本信息
    document.getElementById('basic-info-form').addEventListener('submit', function (e) {
        e.preventDefault();
        const displayName = document.getElementById('p-display-name').value.trim();
        const bio = document.getElementById('p-bio').value.trim();
        if (!displayName) { showToast('显示名称不能为空', 'error'); return; }
        if (bio.length > 200) { showToast('个人简介不能超过200字', 'error'); return; }
        user.displayName = displayName;
        user.bio = bio;
        saveCurrentUser(user);
        document.getElementById('p-name').textContent = displayName;
        renderUserMenu();
        showToast('基本信息已保存');
    });

    // 修改密码（走后端 PUT /api/auth/password，由服务端 bcrypt 校验旧密码并重新加盐哈希）
    document.getElementById('change-password-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const form = this;
        const cur = document.getElementById('current-password').value;
        const nw = document.getElementById('new-password').value;
        const cf = document.getElementById('confirm-new-password').value;
        if (nw.length < 6) { showToast('新密码长度至少6位', 'error'); return; }
        if (nw !== cf) { showToast('两次输入的新密码不一致', 'error'); return; }
        const btn = form.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;
        try {
            await window.API.auth.changePassword(cur, nw);
            form.reset();
            showToast('密码修改成功，请重新登录');
            setTimeout(() => { window.clearToken(); location.href = 'login.html'; }, 1200);
        } catch (err) {
            showToast(err.message || '密码修改失败', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // 清除数据
    document.getElementById('clear-data').addEventListener('click', function () {
        showConfirmDialog('清除数据', '确定要清除您的收藏、点赞与投稿记录吗？', () => {
            user.favorites = []; user.likes = []; user.submissions = [];
            saveCurrentUser(user);
            location.reload();
        });
    });

    // 删除账户（走后端 DELETE /api/auth/account，需密码确认；服务端外键级联清理全部个人数据）
    document.getElementById('delete-account').addEventListener('click', function () {
        showConfirmDialog('删除账户', '确定要永久删除账户吗？此操作不可撤销，你的作品、共创项目与互动记录都会一并删除。', async () => {
            const pwd = window.prompt('请输入当前密码以确认注销：');
            if (!pwd) return;
            try {
                await window.API.auth.deleteAccount(pwd);
                window.clearToken();
                showToast('账户已注销');
                setTimeout(() => location.href = '../index.html', 1200);
            } catch (err) {
                showToast(err.message || '注销失败', 'error');
            }
        });
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.profile-menu-item').forEach(m => m.classList.toggle('active', m.getAttribute('data-tab') === tabId));
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    const el = document.getElementById(tabId);
    if (el) el.classList.add('active');
}

function renderFavorites(user) {
    const container = document.getElementById('favorites-list');
    const favs = user.favorites || [];
    if (!favs.length) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-bookmark"></i><h3>暂无收藏</h3><p>去项目库收藏你喜欢的非遗项目吧</p><a href="projects.html" class="btn btn-outline">浏览项目库</a></div>`;
        return;
    }
    container.innerHTML = `<div class="project-grid">` + favs.map(id => {
        const p = ICH.getProject(id);
        if (!p) return '';
        const cat = ICH.getCategory(p.category);
        return `<a class="project-card" href="project-detail.html?id=${p.id}">
            ${coverHTML(p)}
            <div class="project-body"><h3>${p.name}</h3>
            <div class="project-region"><i class="fas fa-map-marker-alt"></i> ${p.region} · ${cat ? cat.name : ''}</div>
            <p class="project-brief">${p.brief}</p></div></a>`;
    }).join('') + `</div>`;
}

async function renderSubmissions(user) {
    const container = document.getElementById('submissions-list');
    if (!container) return;

    if (!window.API || !window.API.works) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-plug-circle-xmark"></i><h3>内容加载超时</h3><p>网络稍慢，刷新一次页面即可</p></div>';
        return;
    }

    container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>加载中…</p></div>';

    const STATUS_TEXT = { draft: '草稿', pending: '待审核', approved: '已通过', rejected: '未通过', offline: '已下架' };
    let list = [];
    try {
        const data = await window.API.works.mine({ pageSize: 50 });
        list = data.list || [];
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><h3>加载失败</h3><p>' + (err.message || '') + '</p></div>';
        return;
    }

    if (!list.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-lightbulb"></i><h3>暂无投稿</h3><p>在共创广场提交你的创意作品吧</p><a href="co-create.html" class="btn btn-outline">前往共创广场</a></div>';
        return;
    }

    container.innerHTML = '<div class="project-grid">' + list.map(function (w) {
        const statusColor = w.status === 'approved' ? 'var(--success)' : w.status === 'rejected' ? 'var(--danger)' : 'var(--muted)';
        const cover = heritageCoverHTML(w, {
            cls: 'work-cover',
            alt: w.title,
            pill: (w.workType || '作品'),
            pillClass: 'work-cat',
        });
        return '<div class="work-card">' +
            cover +
            '<div class="work-body"><h3>' + w.title + '</h3>' +
            '<p class="work-desc" style="color:var(--muted);font-size:.8rem;">提交于 ' + (w.createdAt || '').slice(0, 10) +
            ' · <b style="color:' + statusColor + '">' + (STATUS_TEXT[w.status] || w.status) + '</b></p>' +
            (w.auditNote ? '<p style="font-size:.78rem;color:var(--danger);">审核意见：' + w.auditNote + '</p>' : '') +
            '<div class="work-actions"><span class="likes"><i class="fas fa-thumbs-up"></i> ' + (w.likesCount || 0) + '</span>' +
            '<span class="likes"><i class="fas fa-eye"></i> ' + (w.viewsCount || 0) + '</span></div>' +
            '</div></div>';
    }).join('') + '</div>';
}

function renderAchievements(user) {
    const userAch = user.achievements || {};
    const total = ichAchievements.length;
    const unlocked = ichAchievements.filter(a => userAch[a.id] && userAch[a.id].unlocked).length;

    document.getElementById('ach-stats').innerHTML = `
        <div class="achievement-stat"><div class="stat-number" style="font-family:var(--font-serif);font-size:2rem;font-weight:bold;color:var(--primary);">${total}</div><div class="stat-label">总成就数</div></div>
        <div class="achievement-stat"><div class="stat-number" style="font-family:var(--font-serif);font-size:2rem;font-weight:bold;color:var(--primary);">${unlocked}</div><div class="stat-label">已解锁</div></div>
        <div class="achievement-stat"><div class="stat-number" style="font-family:var(--font-serif);font-size:2rem;font-weight:bold;color:var(--primary);">${Math.round(unlocked / total * 100)}%</div><div class="stat-label">完成度</div></div>`;

    document.getElementById('ach-grid').innerHTML = ichAchievements.map(a => {
        const isUnlocked = userAch[a.id] && userAch[a.id].unlocked;
        return `<div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}">
            <div class="achievement-icon" style="color:${a.color};"><i class="fas ${a.icon}"></i></div>
            <div class="achievement-content"><h4>${a.title}</h4><p>${a.desc}</p>
            ${isUnlocked ? `<div class="achievement-date" style="font-size:.78rem;color:var(--muted);">获得于 ${formatDate(userAch[a.id].date)}</div>` : `<div class="achievement-progress" style="font-size:.78rem;color:var(--muted);">未解锁</div>`}</div>
            ${isUnlocked ? '<div class="achievement-badge"><i class="fas fa-check"></i></div>' : '<div class="achievement-lock"><i class="fas fa-lock"></i></div>'}
        </div>`;
    }).join('');
}

function formatDate(dateString) {
    if (!dateString) return '未知';
    try {
        return new Date(dateString).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) { return '未知'; }
}
