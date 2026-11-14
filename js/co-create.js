// co-create.js —— 共创作品广场（全部走后端，不再使用 localStorage）
// 数据源：GET /api/works（已过审作品）、GET /api/content/heritage（关联非遗项目）
// 提交：POST /api/works —— 普通用户进审核队列，认证创作者直接发布
let WORK_STATE = { workType: '', page: 1, pageSize: 9, total: 0, loading: false, list: [] };

const WORK_TYPES = ['产品设计', '视觉设计', '文创产品', '数字艺术', '时尚设计', '潮玩设计', 'IP设计', '家居设计', '旅游文创', '其他'];

document.addEventListener('DOMContentLoaded', async function () {
    renderSiteHeader('cocreate');
    renderSiteFooter();
    if (typeof coInjectStyle === 'function') coInjectStyle();

    buildFilters();
    buildTypeSelect();
    await fillHeritageOptions();
    await loadWorks(true);
    initModal();
    renderMyHint();
});

/* ---------------- 筛选条 ---------------- */
function buildFilters() {
    const filters = document.getElementById('work-filters');
    if (!filters) return;
    filters.innerHTML = '';
    const all = document.createElement('button');
    all.className = 'filter-btn active';
    all.setAttribute('data-cat', '');
    all.textContent = '全部作品';
    filters.appendChild(all);

    WORK_TYPES.forEach((t) => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.setAttribute('data-cat', t);
        btn.textContent = t;
        filters.appendChild(btn);
    });

    filters.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        filters.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        WORK_STATE.workType = btn.getAttribute('data-cat');
        loadWorks(true);
    });
}

function buildTypeSelect() {
    const sel = document.getElementById('work-category');
    if (!sel) return;
    sel.innerHTML = '<option value="">请选择类型</option>' +
        WORK_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('');
}

/* ---------------- 我的状态提示 ---------------- */
function renderMyHint() {
    const u = typeof getUserData === 'function' ? getUserData() : null;
    const bar = document.createElement('div');
    bar.style.cssText = 'background:var(--paper-2);border:1px dashed var(--gold-light);border-radius:12px;padding:.7rem 1rem;margin-bottom:1rem;font-size:.86rem;color:var(--ink-3);display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;';
    bar.innerHTML = u
        ? `<i class="fas fa-user-check" style="color:var(--jade)"></i>
           <span>已登录 <b>${coEsc(u.displayName || u.username)}</b>，你的投稿进入「我的作品」可查看审核状态。</span>
           <a class="co-btn co-btn-ghost co-btn-sm" href="my-workspace.html"><i class="fas fa-table-columns"></i> 我的工作台</a>`
        : `<i class="fas fa-circle-info" style="color:var(--gold)"></i>
           <span>登录后即可投稿、点赞与收藏。</span>
           <a class="co-btn co-btn-primary co-btn-sm" href="login.html?redirect=${encodeURIComponent(location.href)}">立即登录</a>`;
    const list = document.getElementById('work-list');
    if (list && list.parentNode) list.parentNode.insertBefore(bar, list);
}

/* ---------------- 作品列表 ---------------- */
async function loadWorks(reset = false) {
    if (WORK_STATE.loading) return;
    WORK_STATE.loading = true;
    if (reset) WORK_STATE.page = 1;

    const container = document.getElementById('work-list');
    if (reset) {
        container.innerHTML = Array.from({ length: 3 }).map(() => coSkeleton(220)).join('');
    }

    try {
        // 后端在线走真实接口；后端没启动（file:// 直接打开）时自动切到内置示例数据，
        // 保证"双击 index.html"也能看到完整页面
        const data = await window.OfflineStore.call(
            () => window.API.works.list({
                workType: WORK_STATE.workType || undefined,
                page: WORK_STATE.page,
                pageSize: WORK_STATE.pageSize,
                sort: 'newest',
            }),
            () => window.OfflineStore.works.list({
                workType: WORK_STATE.workType || '',
                page: WORK_STATE.page,
                pageSize: WORK_STATE.pageSize,
            })
        );
        WORK_STATE.total = data.total;
        const list = data.list || [];
        WORK_STATE.list = reset ? list : WORK_STATE.list.concat(list);

        if (reset && !list.length) {
            container.innerHTML = coEmpty('fa-lightbulb', '这个分类下还没有作品', '成为第一个投稿的人吧');
            container.style.gridTemplateColumns = '1fr';
            return;
        }
        container.style.gridTemplateColumns = '';
        container.innerHTML = (window.__offlineMode ? coOfflineNote() : '') + WORK_STATE.list.map(workCard).join('');
        renderMore();
    } catch (err) {
        container.style.gridTemplateColumns = '1fr';
        container.innerHTML = coErrorPanel(err, '作品加载失败', '作品列表');
    } finally {
        WORK_STATE.loading = false;
    }
}

function workCard(w) {
    const tags = (w.tags || []).slice(0, 3).map((t) => `<span class="tag">${coEsc(t)}</span>`).join('');
    const liked = w.liked;
    // 封面：关联非遗项目的真实照片 + 左上级别角标，右上角是作品类型
    const cover = heritageCoverHTML(w, {
        cls: 'work-cover',
        alt: w.title,
        pill: coEsc(w.workType || '作品'),
        pillClass: 'work-cat',
    });

    return `<div class="work-card">
        ${cover}
        <div class="work-body">
            <h3>${coEsc(w.title)}</h3>
            <div class="work-author"><i class="fas fa-user-pen"></i> ${coEsc(w.author.displayName)}</div>
            <p class="work-desc">${coEsc(w.summary || '')}</p>
            <div class="work-tags">${tags}</div>
            <div class="work-actions">
                <button class="vote-btn ${liked ? 'voted' : ''}" onclick="likeWork('${w.id}', this)">
                    <i class="fas fa-thumbs-up"></i> <span>${w.likesCount}</span>
                </button>
                <span class="likes"><i class="fas fa-eye"></i> ${w.viewsCount}</span>
                <span style="margin-left:auto;font-size:.78rem;color:var(--muted);">
                    <i class="fas fa-calendar"></i> ${coDate(w.createdAt)}
                </span>
            </div>
        </div>
    </div>`;
}

function renderMore() {
    const shown = WORK_STATE.list.length;
    let wrap = document.getElementById('work-more');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'work-more';
        wrap.style.cssText = 'text-align:center;margin:1.2rem 0 3rem;';
        document.getElementById('work-list').parentNode.appendChild(wrap);
    }
    if (shown >= WORK_STATE.total) {
        wrap.innerHTML = WORK_STATE.total > 0
            ? `<span style="color:var(--muted);font-size:.85rem;">已显示全部 ${WORK_STATE.total} 件作品</span>`
            : '';
        return;
    }
    wrap.innerHTML = `<button class="co-btn co-btn-ghost" onclick="loadMore()">加载更多（${shown}/${WORK_STATE.total}）</button>`;
}

async function loadMore() {
    WORK_STATE.page += 1;
    await loadWorks(false);
}

/* ---------------- 点赞 ---------------- */
async function likeWork(id, btn) {
    const u = typeof getUserData === 'function' ? getUserData() : null;
    if (!u) {
        showToast('请先登录后再点赞', 'warning');
        setTimeout(() => { location.href = 'login.html?redirect=' + encodeURIComponent(location.href); }, 1000);
        return;
    }
    const span = btn.querySelector('span');
    const before = Number(span.textContent) || 0;
    const wasLiked = btn.classList.contains('voted');

    // 乐观更新
    btn.classList.toggle('voted', !wasLiked);
    span.textContent = before + (wasLiked ? -1 : 1);

    try {
        const r = await window.OfflineStore.call(
            () => (wasLiked ? window.API.works.unlike(id) : window.API.works.like(id)),
            () => (wasLiked ? window.OfflineStore.works.unlike(id) : window.OfflineStore.works.like(id))
        );
        span.textContent = r.likesCount;
        btn.classList.toggle('voted', r.liked);
    } catch (err) {
        // 失败回滚
        btn.classList.toggle('voted', wasLiked);
        span.textContent = before;
        coHandleError(err, '点赞失败');
    }
}

/* ---------------- 投稿 ---------------- */
function initModal() {
    const modal = document.getElementById('submit-modal');
    if (!modal) return;

    document.getElementById('submit-work-btn').addEventListener('click', () => {
        const u = typeof getUserData === 'function' ? getUserData() : null;
        if (!u) {
            showToast('请先登录后再投稿', 'warning');
            setTimeout(() => { location.href = 'login.html?redirect=' + encodeURIComponent(location.href); }, 1000);
            return;
        }
        modal.classList.add('show');
    });

    const close = () => modal.classList.remove('show');
    document.getElementById('modal-close').addEventListener('click', close);
    document.getElementById('modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    document.getElementById('submit-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const title = document.getElementById('work-title').value.trim();
        const workType = document.getElementById('work-category').value;
        const heritageId = document.getElementById('work-project').value || null;
        const summary = document.getElementById('work-desc').value.trim();
        const tags = document.getElementById('work-tags').value.split(/[,，]/).map((t) => t.trim()).filter(Boolean);

        if (!title || !workType || !summary) return showToast('请完整填写作品信息', 'error');

        const submitBtn = this.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = '提交中…';
        try {
            const w = await window.API.works.create({ title, workType, heritageId, summary, tags });
            this.reset();
            close();
            if (w.status === 'approved') {
                showToast('作品已发布');
                await loadWorks(true);
            } else {
                showToast('作品已提交，等待管理员审核后展示');
            }
        } catch (err) {
            coHandleError(err, '投稿失败');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '提交作品';
        }
    });
}

async function fillHeritageOptions() {
    const sel = document.getElementById('work-project');
    if (!sel) return;
    try {
        const data = await window.API.content.heritage({ pageSize: 100, sort: 'popularity' });
        const opts = (data.list || [])
            .map((h) => `<option value="${coEsc(h.id)}">${coEsc(h.name)}</option>`)
            .join('');
        sel.innerHTML = '<option value="">请选择关联的非遗项目</option>' + opts;

        // 从项目详情跳转时预选
        const param = new URLSearchParams(location.search).get('project');
        if (param) sel.value = param;
    } catch (err) {
        console.warn('加载非遗项目失败', err.message);
    }
}
