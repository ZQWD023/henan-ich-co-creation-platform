/* ==================== ICH_ERROR_GUARD：全局错误可视化 ====================
   任何 JS 报错都直接在页面顶部显示，而不是让页面静默白屏。
   答辩/联调时非常有用：出问题一眼能看出是哪个文件哪一行。 */
(function () {
    if (window.__ICH_ERROR_GUARD__) return;
    window.__ICH_ERROR_GUARD__ = true;

    var cache = {};

    function diagPath() {
        return location.pathname.indexOf('/html/') !== -1 ? 'diagnose.html' : 'html/diagnose.html';
    }

    function show(title, detail) {
        if (cache[title + detail]) return;
        cache[title + detail] = true;
        if (!document.body) { document.addEventListener('DOMContentLoaded', function () { show(title, detail); }); return; }
        var bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#7c1a21;color:#fff;' +
            'font:13px/1.6 -apple-system,"Microsoft YaHei",sans-serif;padding:12px 18px;box-shadow:0 -4px 24px rgba(0,0,0,.3);' +
            'display:flex;gap:14px;align-items:flex-start;';
        bar.innerHTML = '<div style="flex:1;min-width:0;">' +
            '<b>页面脚本报错</b>：' + title +
            (detail ? '<div style="opacity:.85;margin-top:4px;word-break:break-all;font-size:12px;">' + detail + '</div>' : '') +
            '<div style="opacity:.8;margin-top:6px;font-size:12px;">' +
            '请按 F12 打开控制台查看完整堆栈，或打开 <a href="' + diagPath() + '" style="color:#ffd88a;">环境自检</a> 排查。' +
            '</div></div>' +
            '<button style="flex:0 0 auto;background:rgba(255,255,255,.16);border:none;color:#fff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px;">关闭</button>';
        bar.querySelector('button').onclick = function () { bar.remove(); };
        document.body.appendChild(bar);
    }

    window.addEventListener('error', function (e) {
        if (e && e.target && e.target !== window && e.target.tagName) return; // 忽略图片/资源加载失败
        if (!e || !e.message) return;
        show(e.message, (e.filename || '').split('/').slice(-2).join('/') + (e.lineno ? ':' + e.lineno : ''));
    }, true);

    window.addEventListener('unhandledrejection', function (e) {
        var r = e && e.reason;
        var msg = (r && (r.message || r.toString())) || '未知的 Promise 异常';
        show('(' + msg + ')', '可能是接口请求失败或后端未启动');
    });
})();

// script.js - 河南省非物质文化遗产共创平台 公共脚本

// 全局状态
let currentSlide = 0;
let slideInterval = null;
let currentUser = null;

const STORAGE_USERS = 'henanICHUsers';
const STORAGE_CURRENT = 'henanICHCurrentUser';

// ============ 工具：相对路径 ============
function getRelativePath(targetPath) {
    const currentPath = window.location.pathname;
    const isInHtml = currentPath.includes('/html/');
    if (isInHtml) {
        return targetPath.startsWith('html/') ? targetPath.substring(5) : '../' + targetPath;
    }
    return targetPath;
}

// ============ 站点头部注入 ============
function renderSiteHeader(activeKey) {
    const headerEl = document.getElementById('site-header');
    if (!headerEl) return;

    const catLinks = (window.ichCategories || []).map(c =>
        `<a href="${getRelativePath('html/projects.html')}?category=${c.id}"><i class="fas ${c.icon}"></i> ${c.name}</a>`
    ).join('');

    headerEl.innerHTML = `
    <div class="nav-top">
        <div class="container">
            <span><i class="fas fa-dragon"></i> 弘扬中原文化 · 传承非遗薪火</span>
            <span class="nav-top-right"><i class="fas fa-map-marker-alt"></i> 河南省非物质文化遗产共创平台
                <a class="nav-self-check" href="${getRelativePath('html/diagnose.html')}"><i class="fas fa-stethoscope"></i> 环境自检</a>
            </span>
        </div>
    </div>
    <header>
        <div class="container">
            <nav>
                <a href="${getRelativePath('index.html')}" class="logo">
                    <span class="logo-mark">
                        <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="24" cy="24" r="22" fill="#a3242c" stroke="#c19a4b" stroke-width="2"/>
                            <circle cx="24" cy="24" r="17" fill="none" stroke="#e0c887" stroke-width="1" opacity="0.7"/>
                            <text x="24" y="31" text-anchor="middle" font-size="20" fill="#f5e8c8" font-family="KaiTi,STKaiti,serif" font-weight="bold">豫</text>
                        </svg>
                    </span>
                    <span class="logo-text">
                        <span class="zh">非遗共创·中原</span>
                        <span class="en">HENAN ICH CO-CREATION</span>
                    </span>
                </a>
                <ul class="nav-links">
                    <li><a href="${getRelativePath('index.html')}" class="${activeKey === 'home' ? 'active' : ''}"><i class="fas fa-home"></i> 首页</a></li>
                    <li><a class="nav-ai-link" href="${getRelativePath('html/ai-chat.html')}"><i class="fas fa-comments" aria-hidden="true"></i> AI 非遗问答</a></li>
                    <li class="dropdown">
                        <a href="${getRelativePath('html/projects.html')}" class="${activeKey === 'projects' ? 'active' : ''}"><i class="fas fa-book-open"></i> 非遗项目库 <i class="fas fa-chevron-down"></i></a>
                        <div class="dropdown-content">${catLinks}</div>
                    </li>
                    <li><a href="${getRelativePath('html/inheritors.html')}" class="${activeKey === 'inheritors' ? 'active' : ''}"><i class="fas fa-hand-fist"></i> 传承人</a></li>
                    <li><a href="${getRelativePath('html/co-create.html')}" class="${activeKey === 'cocreate' ? 'active' : ''}"><i class="fas fa-lightbulb"></i> 共创广场</a></li>
                    <li><a href="${getRelativePath('html/co-projects.html')}" class="${activeKey === 'co-projects' ? 'active' : ''}"><i class="fas fa-people-group"></i> 共创项目</a></li>
                    <li><a href="${getRelativePath('html/my-workspace.html')}" class="${activeKey === 'workspace' ? 'active' : ''}"><i class="fas fa-table-columns"></i> 我的工作台</a></li>
                    <li><a href="${getRelativePath('html/events.html')}" class="${activeKey === 'events' ? 'active' : ''}"><i class="fas fa-calendar-days"></i> 活动资讯</a></li>
                    <li><a href="${getRelativePath('html/gallery.html')}" class="${activeKey === 'gallery' ? 'active' : ''}"><i class="fas fa-images"></i> 数字展馆</a></li>
                    <li><a href="${getRelativePath('html/about.html')}" class="${activeKey === 'about' ? 'active' : ''}"><i class="fas fa-circle-info"></i> 关于</a></li>
                    <li class="user-menu" id="user-menu"></li>
                </ul>
                <div class="mobile-menu-btn"><i class="fas fa-bars"></i></div>
            </nav>
        </div>
    </header>`;

    initMobileMenu();
    checkLoginStatus();
}

// ============ 站点页脚注入 ============
function renderSiteFooter() {
    const footerEl = document.getElementById('site-footer');
    if (!footerEl) return;
    footerEl.innerHTML = `
    <footer>
        <div class="container">
            <div class="footer-content">
                <div class="footer-section">
                    <h3><i class="fas fa-dragon"></i> 非遗共创·中原</h3>
                    <p>河南省非物质文化遗产共创平台，致力于挖掘、展示与活化中原非遗，搭建传承人与设计师、公众之间的共创桥梁。</p>
                </div>
                <div class="footer-section">
                    <h3><i class="fas fa-link"></i> 快速链接</h3>
                    <ul>
                        <li><a href="${getRelativePath('index.html')}">首页</a></li>
                        <li><a href="${getRelativePath('html/projects.html')}">非遗项目库</a></li>
                        <li><a href="${getRelativePath('html/inheritors.html')}">传承人名录</a></li>
                        <li><a href="${getRelativePath('html/co-create.html')}">共创广场</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h3><i class="fas fa-map-location-dot"></i> 非遗分类</h3>
                    <ul>
                        <li><a href="${getRelativePath('html/projects.html')}?category=chuantong-xiju">传统戏剧</a></li>
                        <li><a href="${getRelativePath('html/projects.html')}?category=chuantong-jiyi">传统技艺</a></li>
                        <li><a href="${getRelativePath('html/projects.html')}?category=tiyu-zaji">传统体育</a></li>
                        <li><a href="${getRelativePath('html/projects.html')}?category=chuantong-meishu">传统美术</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h3><i class="fas fa-envelope"></i> 联系我们</h3>
                    <p>邮箱：contact@henan-ich.cn<br>电话：0371-12345678<br>地址：河南省郑州市</p>
                </div>
            </div>
            <div class="footer-bottom">
                <p>© 2026 河南省非物质文化遗产共创平台 · 本网站为教学演示项目，非遗信息依据公开资料整理</p>
            </div>
        </div>
    </footer>`;
}

// ============ 登录态管理 ============
function checkLoginStatus() {
    const data = localStorage.getItem(STORAGE_CURRENT);
    currentUser = data ? JSON.parse(data) : null;
    renderUserMenu();
}

function renderUserMenu() {
    const menu = document.getElementById('user-menu');
    if (!menu) return;
    if (currentUser) {
        const profilePath = getRelativePath('html/profile.html');
        const workspacePath = getRelativePath('html/my-workspace.html');
        const adminPath = getRelativePath('html/admin.html');
        menu.innerHTML = `
            <div class="dropdown">
                <a href="#"><i class="fas fa-user"></i> <span class="user-name">${currentUser.displayName || currentUser.username}</span> <i class="fas fa-chevron-down"></i></a>
                <div class="dropdown-content">
                    <a href="${profilePath}"><i class="fas fa-user-circle"></i> 个人中心</a>
                    <a href="${profilePath}?tab=favorites"><i class="fas fa-bookmark"></i> 我的收藏</a>
                    <a href="${workspacePath}"><i class="fas fa-table-columns"></i> 我的工作台</a>
                    ${currentUser.role === 'admin' ? `<a href="${adminPath}"><i class="fas fa-shield-halved"></i> 后台管理</a>` : ''}
                    <a href="#" id="logout-link"><i class="fas fa-sign-out-alt"></i> 退出登录</a>
                </div>
            </div>`;
        const logout = document.getElementById('logout-link');
        if (logout) logout.addEventListener('click', function (e) { e.preventDefault(); logoutUser(); });
    } else {
        const loginPath = getRelativePath('html/login.html');
        const registerPath = getRelativePath('html/register.html');
        menu.innerHTML = `
            <a href="${loginPath}" class="nav-login-btn"><i class="fas fa-sign-in-alt"></i> 登录</a>
            <a href="${registerPath}" class="nav-register-btn"><i class="fas fa-user-plus"></i> 注册</a>`;
    }
}

function logoutUser() {
    localStorage.removeItem(STORAGE_CURRENT);
    currentUser = null;
    showToast('您已退出登录');
    renderUserMenu();
    setTimeout(() => { window.location.reload(); }, 800);
}

// ============ 收藏（非遗项目） ============
function getUserData() {
    return JSON.parse(localStorage.getItem(STORAGE_CURRENT) || 'null');
}
function saveCurrentUser(u) {
    // 账号与业务数据以服务端为准，本地仅缓存"当前登录用户"用于渲染与状态回填
    localStorage.setItem(STORAGE_CURRENT, JSON.stringify(u));
}

function isFavorited(projectId) {
    const u = getUserData();
    return u && Array.isArray(u.favorites) && u.favorites.includes(projectId);
}

function toggleFavorite(projectId, projectName) {
    const u = getUserData();
    if (!u) {
        showToast('请先登录后再收藏', 'warning');
        setTimeout(() => { window.location.href = getRelativePath('html/login.html') + '?redirect=' + encodeURIComponent(window.location.href); }, 1200);
        return false;
    }
    if (!Array.isArray(u.favorites)) u.favorites = [];
    const idx = u.favorites.indexOf(projectId);
    const adding = idx === -1;
    const prev = u.favorites.slice();

    // 先更新本地缓存（乐观更新，保证界面立即响应）
    if (adding) u.favorites.push(projectId);
    else u.favorites.splice(idx, 1);
    saveCurrentUser(u);
    renderUserMenu();

    const tip = adding ? '已收藏「' + projectName + '」' : '已取消收藏「' + projectName + '」';
    if (!window.API || !window.API.community) { showToast(tip); return true; }

    // 再同步到后端；失败则回滚
    window.API.community.toggle('heritage', projectId, 'favorite')
        .then(() => {
            showToast(tip, adding ? 'success' : 'info');
            if (adding && u.favorites.length >= 10) unlockAchievement('collector');
        })
        .catch((err) => {
            u.favorites = prev;
            saveCurrentUser(u);
            renderUserMenu();
            showToast('收藏失败：' + (err.message || '请检查登录状态'), 'error');
        });
    return true;
}

// ============ 点赞（共创作品） ============
function isLiked(workId) {
    const u = getUserData();
    return u && Array.isArray(u.likes) && u.likes.includes(workId);
}

function toggleLike(workId, workTitle) {
    const u = getUserData();
    if (!u) {
        showToast('请先登录后再点赞', 'warning');
        setTimeout(() => { window.location.href = getRelativePath('html/login.html') + '?redirect=' + encodeURIComponent(window.location.href); }, 1200);
        return false;
    }
    if (!Array.isArray(u.likes)) u.likes = [];
    const idx = u.likes.indexOf(workId);
    const adding = idx === -1;
    const prev = u.likes.slice();

    if (adding) u.likes.push(workId);
    else u.likes.splice(idx, 1);
    saveCurrentUser(u);

    const tip = adding ? '已为「' + workTitle + '」点赞' : '已取消点赞';
    if (!window.API || !window.API.community) { showToast(tip); return true; }

    window.API.community.toggle('work', workId, 'like')
        .then(() => {
            showToast(tip, adding ? 'success' : 'info');
            if (adding && u.likes.length >= 10) unlockAchievement('voter');
        })
        .catch((err) => {
            u.likes = prev;
            saveCurrentUser(u);
            showToast('点赞失败：' + (err.message || '请检查登录状态'), 'error');
        });
    return true;
}

// ============ 成就解锁 ============
function unlockAchievement(id) {
    const u = getUserData();
    if (!u) return;
    if (!u.achievements) u.achievements = {};
    if (u.achievements[id] && u.achievements[id].unlocked) return;
    u.achievements[id] = { unlocked: true, date: new Date().toISOString() };
    saveCurrentUser(u);
    const ach = (window.ichAchievements || []).find(a => a.id === id);
    if (ach) showToast(`🏅 解锁成就：${ach.title}`, 'success');
}

// ============ 移动端菜单 ============
function initMobileMenu() {
    const btn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    if (!btn || !navLinks) return;
    btn.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        btn.innerHTML = navLinks.classList.contains('active') ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
    });
    // 事件委托：登录/注册按钮是后续动态注入的，也能正常收起菜单
    navLinks.addEventListener('click', (e) => {
        if (!e.target.closest('a')) return;
        if (getComputedStyle(btn).display === 'none') return; // 桌面模式无需收起
        navLinks.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-bars"></i>';
    });
}

// ============ 轮播图 ============
function initCarousel() {
    const slides = document.querySelectorAll('.carousel-item');
    const indicators = document.querySelectorAll('.indicator');
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    const container = document.querySelector('.carousel-container');
    if (!slides.length) return;
    updateCarousel();
    slideInterval = setInterval(nextSlide, 5000);
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);
    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    indicators.forEach((ind, i) => ind.addEventListener('click', () => goToSlide(i)));
    if (container) {
        container.addEventListener('mouseenter', () => clearInterval(slideInterval));
        container.addEventListener('mouseleave', () => { slideInterval = setInterval(nextSlide, 5000); });
    }
}
function nextSlide() {
    const slides = document.querySelectorAll('.carousel-item');
    currentSlide = (currentSlide + 1) % slides.length;
    updateCarousel();
}
function prevSlide() {
    const slides = document.querySelectorAll('.carousel-item');
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    updateCarousel();
}
function goToSlide(i) {
    const slides = document.querySelectorAll('.carousel-item');
    currentSlide = i % slides.length;
    updateCarousel();
}
function updateCarousel() {
    const slide = document.querySelector('.carousel-slide');
    const indicators = document.querySelectorAll('.indicator');
    const count = document.querySelectorAll('.carousel-item').length || 4;
    if (slide) slide.style.transform = `translateX(-${currentSlide * (100 / count)}%)`;
    indicators.forEach((ind, i) => ind.classList.toggle('active', i === currentSlide));
    clearInterval(slideInterval);
    slideInterval = setInterval(nextSlide, 5000);
}

// ============ Tab 切换 ============
function initTabs() {
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(btn => btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(target);
        if (panel) panel.classList.add('active');
    }));
}

// ============ Toast ============
function showToast(message, type = 'success') {
    let toast = document.getElementById('message-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'message-toast';
        toast.className = 'toast';
        toast.innerHTML = '<i class="fas fa-check-circle toast-icon"></i><span class="toast-text"></span>';
        document.body.appendChild(toast);
    }
    const text = toast.querySelector('.toast-text');
    const icon = toast.querySelector('.toast-icon');
    text.textContent = message;
    const config = {
        success: ['#2f8f5f', 'fa-check-circle'],
        error: ['#b0245a', 'fa-circle-exclamation'],
        warning: ['#d08a2e', 'fa-triangle-exclamation'],
        info: ['#2f5a8f', 'fa-circle-info']
    };
    const [bg, ic] = config[type] || config.success;
    toast.style.backgroundColor = bg;
    icon.className = 'fas ' + ic + ' toast-icon';
    toast.style.display = 'flex';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ============ 模态框 ============
function showConfirmDialog(title, message, callback) {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'confirm-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header"><h3>${title}</h3><button class="modal-close">&times;</button></div>
            <div class="modal-body"><p>${message}</p></div>
            <div class="modal-footer">
                <button class="btn btn-outline" id="confirm-cancel">取消</button>
                <button class="btn" id="confirm-ok">确定</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#confirm-cancel').addEventListener('click', close);
    modal.querySelector('#confirm-ok').addEventListener('click', () => { callback && callback(); close(); });
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

// ============ 封面生成 & 真实图片解析 ============
const wikiThumbCache = {};

// 生成项目封面（渐变底 + 图标/名称兜底 + 真实照片覆盖）
// 配图约定：img/gallery/<项目id>.jpg 为每个项目专属照片；
// 若缺失，自动退回 img/gallery/<分类id>.jpg（门类图），再失败才露出渐变底。
function coverHTML(p, opts) {
    opts = opts || {};
    const cls = opts.cls || 'project-cover';
    const height = opts.height || '';
    const iconSize = opts.iconSize || '3rem';
    const showBadge = opts.badge !== false;
    const showName = opts.name !== false;

    // 专属照片 → 门类图 → 渐变底，三级降级
    const src = getRelativePath(p.img || ('img/gallery/' + p.id + '.jpg'));
    const fb = getRelativePath('img/gallery/' + p.category + '.jpg');

    const img = `<img class="cover-img" alt="${p.name}" src="${src}" data-fallback="${fb}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="coverImgFallback(this)">`;
    const badge = showBadge ? `<span class="level-badge">${p.level}</span>` : '';
    const name = showName ? `<span class="cover-name">${p.name}</span>` : '';
    const style = height ? `height:${height};` : '';
    return `<div class="${cls}" style="background:${p.gradient};${style}">
        <div class="cover-fallback">
            <i class="fas ${p.icon}" style="font-size:${iconSize};"></i>
            ${name}
        </div>
        ${badge}
        ${img}
    </div>`;
}

// 配图加载失败：先退回同一门类的图片，再失败就移除，露出渐变底
function coverImgFallback(img) {
    const fb = img.getAttribute('data-fallback');
    if (fb && !img.dataset.fbTried) {
        img.dataset.fbTried = '1';
        img.src = fb;
    } else {
        img.remove();
    }
}

// 共创作品封面：叠加该作品专属配图（img/works/<作品id>.jpg）+ 暗色压层，保证类型标签可读
function workCoverStyle(w) {
    w = w || {};
    const base = w.gradient || 'linear-gradient(135deg,#a3242c,#c19a4b)';
    const src = getRelativePath('img/works/' + (w.id || '') + '.jpg');
    return `background-image:linear-gradient(rgba(0,0,0,.40),rgba(0,0,0,.58)),url('${src}'),${base};background-size:cover;background-position:center;`;
}

// 图片加载失败：先尝试维基百科 API，再回退到封面兜底
function coverImgError(img) {
    if (img.dataset.fallbackTried) { img.remove(); return; }
    img.dataset.fallbackTried = '1';
    img.removeAttribute('src');
    const wiki = img.getAttribute('data-wiki');
    if (!wiki) { img.remove(); return; }
    resolveWikiFor(img, wiki);
}

function resolveWikiFor(img, title) {
    if (wikiThumbCache[title]) {
        img.src = wikiThumbCache[title];
        img.onerror = () => img.remove();
        return;
    }
    const url = 'https://zh.wikipedia.org/w/api.php?action=query&redirects=1&prop=pageimages&format=json&origin=*&pithumbsize=900&titles=' + encodeURIComponent(title);
    fetch(url).then(r => r.json()).then(data => {
        const pages = (data && data.query && data.query.pages) || {};
        for (const k in pages) {
            const pg = pages[k];
            if (pg && pg.thumbnail && pg.thumbnail.source) wikiThumbCache[pg.title] = pg.thumbnail.source;
        }
        const src = wikiThumbCache[title];
        if (src) { img.src = src; img.onerror = () => img.remove(); }
        else { img.remove(); }
    }).catch(() => img.remove());
}

// ============ 页面初始化 ============
document.addEventListener('DOMContentLoaded', function () {
    // 若页面存在轮播则初始化
    if (document.querySelector('.carousel-container')) initCarousel();
    if (document.querySelector('.tab-btn')) initTabs();
});

// 导出全局
window.renderSiteHeader = renderSiteHeader;
window.renderSiteFooter = renderSiteFooter;
window.checkLoginStatus = checkLoginStatus;
window.renderUserMenu = renderUserMenu;
window.logoutUser = logoutUser;
window.isFavorited = isFavorited;
window.toggleFavorite = toggleFavorite;
window.isLiked = isLiked;
window.toggleLike = toggleLike;
window.showToast = showToast;
window.showConfirmDialog = showConfirmDialog;
window.getRelativePath = getRelativePath;
window.unlockAchievement = unlockAchievement;
window.getUserData = getUserData;
window.saveCurrentUser = saveCurrentUser;
window.coverHTML = coverHTML;
window.coverImgFallback = coverImgFallback;
window.workCoverStyle = workCoverStyle;
window.coverImgError = coverImgError;
window.STORAGE_USERS = STORAGE_USERS;
window.STORAGE_CURRENT = STORAGE_CURRENT;


/* ============ 从后端同步"我的收藏 / 点赞"（替代纯本地缓存） ============ */
async function syncInteractions() {
    const u = getUserData();
    if (!u || !window.API || !window.API.community) return;
    try {
        const [favs, likes] = await Promise.all([
            window.API.community.myInteractions('heritage', 'favorite'),
            window.API.community.myInteractions('work', 'like'),
        ]);
        u.favorites = Array.isArray(favs) ? favs : [];
        u.likes = Array.isArray(likes) ? likes : [];
        saveCurrentUser(u);
        renderUserMenu();
        window.dispatchEvent(new CustomEvent('ich:interactions-synced'));
    } catch (e) {
        /* 后端不可用时保留本地缓存，不影响页面 */
    }
}
window.syncInteractions = syncInteractions;

document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () { if (typeof syncInteractions === 'function') syncInteractions(); }, 0);
});
