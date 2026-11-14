// co-projects.js —— 共创项目列表页
let coState = { status: '', keyword: '', sort: 'newest', page: 1, pageSize: 9, total: 0, loading: false };

document.addEventListener('DOMContentLoaded', async function () {
    coInjectStyle();
    if (typeof renderSiteHeader === 'function') renderSiteHeader('co-projects');
    if (typeof renderSiteFooter === 'function') renderSiteFooter();

    initFilters();
    initCreateModal();
    renderShortcut();
    await loadProjects(true);
});

/* ---------------- 我的快捷入口 ---------------- */
function renderShortcut() {
    const u = getUserData();
    const el = document.getElementById('my-shortcut');
    if (!u) {
        el.innerHTML = `<div class="co-shortcut">
            <i class="fas fa-circle-info" style="color:var(--gold)"></i>
            <span>登录后可以申请加入项目、领取任务、提交成果。</span>
            <a class="co-btn co-btn-primary co-btn-sm" href="login.html?redirect=${encodeURIComponent(location.href)}">立即登录</a>
        </div>`;
        return;
    }
    el.innerHTML = `<div class="co-shortcut">
        <i class="fas fa-user-check" style="color:var(--jade)"></i>
        <span>已登录：<b>${coEsc(u.displayName || u.username)}</b>（${coEsc(u.role === 'admin' ? '管理员' : u.role === 'creator' ? '创作/传承人' : '普通用户')}）</span>
        <a class="co-btn co-btn-ghost co-btn-sm" href="my-workspace.html"><i class="fas fa-table-columns"></i> 我的工作台</a>
        <a class="co-btn co-btn-ghost co-btn-sm" href="co-create.html"><i class="fas fa-lightbulb"></i> 作品广场</a>
    </div>`;
}

/* ---------------- 筛选交互 ---------------- */
function initFilters() {
    const filters = document.getElementById('status-filters');
    filters.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        filters.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        coState.status = btn.getAttribute('data-status');
        loadProjects(true);
    });

    let timer = null;
    document.getElementById('keyword').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            coState.keyword = e.target.value.trim();
            loadProjects(true);
        }, 350);
    });

    document.getElementById('sort').addEventListener('change', (e) => {
        coState.sort = e.target.value;
        loadProjects(true);
    });
}

/* ---------------- 列表加载 ---------------- */
async function loadProjects(reset = false) {
    if (coState.loading) return;
    coState.loading = true;
    if (reset) coState.page = 1;

    const listEl = document.getElementById('project-list');
    const moreEl = document.getElementById('load-more-wrap');

    if (reset) {
        listEl.innerHTML = Array.from({ length: 3 }).map(() => coSkeleton(240)).join('');
        moreEl.innerHTML = '';
    }

    try {
        // 后端没启动（file:// 直接打开）时自动切到内置示例数据
        const data = await window.OfflineStore.call(
            () => window.API.projects.list({
                status: coState.status || undefined,
                keyword: coState.keyword || undefined,
                sort: coState.sort,
                page: coState.page,
                pageSize: coState.pageSize,
            }),
            () => window.OfflineStore.projects.list({
                status: coState.status || '',
                keyword: coState.keyword || '',
                page: coState.page,
                pageSize: coState.pageSize,
            })
        );

        coState.total = data.total;
        const list = data.list || [];

        if (reset) {
            if (!list.length) {
                listEl.innerHTML = coEmpty(
                    'fa-people-group',
                    '还没有符合条件的共创项目',
                    coState.keyword ? '换个关键词试试，或者自己发起一个。' : '成为第一个发起共创的人吧。',
                    `<button class="co-btn co-btn-primary" onclick="document.getElementById('create-btn').click()"><i class="fas fa-plus"></i> 发起共创</button>`
                );
                listEl.style.gridTemplateColumns = '1fr';
                return;
            }
            listEl.style.gridTemplateColumns = '';
            listEl.innerHTML = (window.__offlineMode ? coOfflineNote() : '') + list.map(projectCard).join('');
        } else {
            listEl.insertAdjacentHTML('beforeend', list.map(projectCard).join(''));
        }

        renderLoadMore();
    } catch (err) {
        listEl.style.gridTemplateColumns = '1fr';
        listEl.innerHTML = coErrorPanel(err, '项目加载失败', '共创项目');
    } finally {
        coState.loading = false;
    }
}

function projectCard(p) {
    const meta = coStatusMeta(p.status);
    // 封面：关联非遗项目的真实照片 + 左上级别角标（与非遗项目卡片同款），右上角是项目状态
    const cover = heritageCoverHTML(p, {
        cls: 'co-card-cover',
        alt: p.title,
        pill: `<i class="fas ${meta.icon}"></i> ${meta.text}`,
        pillClass: 'co-cover-pill',
    });
    return `
    <a class="co-card" href="co-project-detail.html?id=${encodeURIComponent(p.id)}" style="text-decoration:none;color:inherit;">
        ${cover}
        <div class="co-card-body">
            <h3 class="co-card-title">${coEsc(p.title)}</h3>
            <p class="co-card-desc">${coEsc(p.description || '暂无项目说明')}</p>
            ${p.heritageName ? `<div class="co-meta-row"><i class="fas fa-link"></i> ${coEsc(p.heritageName)}</div>` : ''}
            <div class="co-card-progress">
                <div style="display:flex;justify-content:space-between;font-size:.76rem;color:var(--muted);">
                    <span>任务进度</span><span>${p.progress}%（${p.taskStats.done}/${p.taskStats.total}）</span>
                </div>
                ${coProgressBar(p.progress)}
            </div>
            <div class="co-card-foot">
                <div class="co-meta-row">
                    ${coAvatar(p.owner, 26)}
                    <span>${coEsc(p.owner.displayName)}</span>
                </div>
                <div class="co-meta-row">
                    <span><i class="fas fa-user-group"></i> ${p.membersCount}/${p.memberLimit}</span>
                    ${p.deadline ? `<span>${coDeadline(p.deadline)}</span>` : ''}
                </div>
            </div>
        </div>
    </a>`;
}

function renderLoadMore() {
    const moreEl = document.getElementById('load-more-wrap');
    const shown = coState.page * coState.pageSize;
    if (shown >= coState.total) {
        moreEl.innerHTML = coState.total > 0
            ? `<span style="color:var(--muted);font-size:.85rem;">已显示全部 ${coState.total} 个项目</span>`
            : '';
        return;
    }
    moreEl.innerHTML = `<button class="co-btn co-btn-ghost" id="load-more">
        加载更多（${shown}/${coState.total}）
      </button>`;
    document.getElementById('load-more').addEventListener('click', async () => {
        coState.page += 1;
        await loadProjects(false);
    });
}

/* ---------------- 发起共创 ---------------- */
function initCreateModal() {
    const modal = document.getElementById('create-modal');
    const open = () => {
        const u = coRequireLogin();
        if (!u) return;
        if (!coCanCreate(u)) {
            showToast('发起共创需要「已认证传承人 / 创作者」身份，请先完成认证或联系管理员', 'error');
            return;
        }
        fillHeritageOptions();
        modal.classList.add('show');
    };

    document.getElementById('create-btn').addEventListener('click', open);
    document.getElementById('create-close').addEventListener('click', () => modal.classList.remove('show'));
    document.getElementById('create-cancel').addEventListener('click', () => modal.classList.remove('show'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });

    document.getElementById('create-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const btn = document.getElementById('f-submit');
        const title = document.getElementById('f-title').value.trim();
        const description = document.getElementById('f-desc').value.trim();
        const recruitNeed = document.getElementById('f-need').value.trim();
        const heritageId = document.getElementById('f-heritage').value || null;
        const memberLimit = Number(document.getElementById('f-limit').value) || 6;
        const deadlineRaw = document.getElementById('f-deadline').value;

        if (title.length < 4) return showToast('项目名称至少 4 个字', 'error');
        if (description.length < 10) return showToast('项目说明至少 10 个字', 'error');

        btn.disabled = true;
        btn.textContent = '创建中…';
        try {
            const payload = {
                title,
                description,
                recruitNeed,
                heritageId,
                memberLimit,
                deadline: deadlineRaw ? new Date(deadlineRaw + 'T23:59:59').toISOString() : undefined,
                publish: true,
            };
            // 有后端走真实接口；静态演示（无后端）落到 localStorage，功能不会"点了没反应"
            const p = await window.OfflineStore.call(
                () => window.API.projects.create(payload),
                () => window.OfflineStore.projects.create(payload)
            );
            showToast('项目已发布，正在进入详情页…');
            setTimeout(() => { location.href = `co-project-detail.html?id=${encodeURIComponent(p.id)}`; }, 700);
        } catch (err) {
            coHandleError(err, '创建失败');
        } finally {
            btn.disabled = false;
            btn.textContent = '发布并开始招募';
        }
    });
}

async function fillHeritageOptions() {
    const sel = document.getElementById('f-heritage');
    if (sel.dataset.filled) return;
    try {
        const data = await window.API.content.heritage({ pageSize: 100, sort: 'popularity' });
        const opts = (data.list || [])
            .map((h) => `<option value="${coEsc(h.id)}">${coEsc(h.name)}（${coEsc(h.level || '')}）</option>`)
            .join('');
        sel.insertAdjacentHTML('beforeend', opts);
        sel.dataset.filled = '1';
    } catch (err) {
        /* 静默失败：只是少一个下拉选项 */
        console.warn('加载非遗项目失败', err.message);
    }
}
