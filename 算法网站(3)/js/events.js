// events.js —— 活动资讯（活动与报名全部走后端，不再使用 localStorage）
// 数据源：GET /api/content/events（含 signupCount / signed）、GET /api/content/news
let EVENTS = [];

document.addEventListener('DOMContentLoaded', async function () {
    renderSiteHeader('events');
    renderSiteFooter();
    if (typeof coInjectStyle === 'function') coInjectStyle();

    initEventTabs();
    await Promise.all([loadEvents(), loadNews()]);

    // 已登录则加载我的报名（用于按钮状态）
    const u = getUserData();
    if (u && window.API) {
        try {
            const mine = await window.API.content.mySignups();
            const set = new Set((mine || []).map((m) => m.event_id));
            EVENTS = EVENTS.map((e) => ({ ...e, signed: set.has(e.id) }));
            renderEvents();
        } catch (e) {
            /* 静默 */
        }
    }
});

function initEventTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach((b) => { b.classList.remove('active'); b.style.color = ''; });
            document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
            btn.classList.add('active');
            btn.style.color = 'var(--primary)';
            const panel = document.getElementById(btn.getAttribute('data-tab'));
            if (panel) panel.classList.add('active');
        });
    });
    document.querySelectorAll('.tab-btn').forEach((b) => { if (!b.classList.contains('active')) b.style.color = 'var(--ink-2)'; });
}

/* ---------------- 活动 ---------------- */
async function loadEvents() {
    const container = document.getElementById('events-list');
    try {
        EVENTS = await window.OfflineStore.call(
            () => window.API.content.events(),
            () => window.OfflineStore.content.events()
        );
        renderEvents();
        if (window.__offlineMode && container) {
            container.insertAdjacentHTML('afterbegin', coOfflineNote('活动'));
        }
    } catch (err) {
        if (container) container.innerHTML = coErrorPanel(err, '活动加载失败', '活动列表');
    }
}

function renderEvents() {
    const container = document.getElementById('events-list');
    if (!container) return;
    const u = getUserData();

    if (!EVENTS.length) {
        container.innerHTML = coEmpty('fa-calendar-xmark', '暂无活动', '稍后再来看看');
        return;
    }

    container.innerHTML = EVENTS.map((e) => {
        const ended = e.status === '已结束';
        let btn;
        if (ended) {
            btn = `<button class="btn btn-sm btn-outline" disabled><i class="fas fa-ban"></i> 已结束</button>`;
        } else if (e.signed) {
            btn = `<button class="btn btn-sm btn-gold" disabled><i class="fas fa-check"></i> 已报名</button>`;
        } else {
            btn = `<button class="btn btn-sm" onclick="openSignup('${e.id}')"><i class="fas fa-pen"></i> 报名</button>`;
        }

        return `<div class="list-row">
            <div class="list-icon"><i class="fas ${coEsc(e.icon || 'fa-calendar-days')}"></i></div>
            <div class="list-content">
                <h3>${coEsc(e.title)}</h3>
                <p class="summary">${coEsc(e.desc || '')}</p>
                <div class="list-meta">
                    <span><i class="fas fa-calendar"></i> ${coEsc(e.date || '')}</span>
                    <span><i class="fas fa-map-marker-alt"></i> ${coEsc(e.location || '')}</span>
                    <span><i class="fas fa-tag"></i> ${coEsc(e.type || '')}</span>
                    <span><i class="fas fa-users"></i> ${e.signupCount || 0} 人报名</span>
                    <span class="status-badge status-${coEsc(e.status || '')}">${coEsc(e.status || '')}</span>
                </div>
            </div>
            ${btn}
        </div>`;
    }).join('');
}

/* ---------------- 报名（弹窗收集真实姓名 + 手机） ---------------- */
function openSignup(id) {
    const u = getUserData();
    if (!u) {
        showToast('请先登录后再报名', 'warning');
        setTimeout(() => { location.href = getRelativePath('html/login.html') + '?redirect=' + encodeURIComponent(location.href); }, 1000);
        return;
    }

    const ev = EVENTS.find((x) => x.id === id);
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:460px;">
            <div class="modal-header">
                <h3><i class="fas fa-pen"></i> 报名：${coEsc(ev ? ev.title : '')}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>真实姓名 <span style="color:var(--danger)">*</span></label>
                    <input type="text" class="form-control" id="su-name" maxlength="20" placeholder="用于现场签到">
                </div>
                <div class="form-group">
                    <label>手机号 <span style="color:var(--danger)">*</span></label>
                    <input type="tel" class="form-control" id="su-phone" maxlength="11" placeholder="11 位手机号，用于活动通知">
                </div>
                <div class="form-group">
                    <label>备注</label>
                    <textarea class="form-control" id="su-notes" rows="2" maxlength="200" placeholder="例如：想参加下午场（选填）"></textarea>
                </div>
                <div class="form-actions" style="display:flex;gap:10px;">
                    <button class="btn" id="su-submit">确认报名</button>
                    <button class="btn btn-outline" id="su-cancel">取消</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#su-cancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    modal.querySelector('#su-submit').addEventListener('click', async function () {
        const realName = modal.querySelector('#su-name').value.trim();
        const phone = modal.querySelector('#su-phone').value.trim();
        const notes = modal.querySelector('#su-notes').value.trim();

        if (realName.length < 2) return showToast('请输入真实姓名', 'error');
        if (!/^1[3-9]\d{9}$/.test(phone)) return showToast('请输入正确的 11 位手机号', 'error');

        this.disabled = true;
        this.textContent = '提交中…';
        try {
            await window.API.content.signupEvent(id, { realName, phone, notes });
            close();
            showToast('报名成功');
            await loadEvents();
            if (typeof unlockAchievement === 'function') unlockAchievement('event-goer');
        } catch (err) {
            coHandleError(err, '报名失败');
            this.disabled = false;
            this.textContent = '确认报名';
        }
    });
}

/* ---------------- 资讯 ---------------- */
async function loadNews() {
    const container = document.getElementById('news-list');
    if (!container) return;
    try {
        const data = await window.OfflineStore.call(
            () => window.API.content.news({ pageSize: 20 }),
            () => ({ list: window.OfflineStore.content.news(), total: window.OfflineStore.content.news().length })
        );
        const list = data.list || [];
        if (!list.length) {
            container.innerHTML = coEmpty('fa-newspaper', '暂无资讯', '');
            return;
        }
        container.innerHTML = list.map((n) => `
            <div class="list-row">
                <div class="list-icon" style="background:linear-gradient(135deg,var(--blue),var(--jade));"><i class="fas fa-newspaper"></i></div>
                <div class="list-content">
                    <h3>${coEsc(n.title)}</h3>
                    <p class="summary">${coEsc(n.summary || '')}</p>
                    <div class="list-meta">
                        <span><i class="fas fa-calendar"></i> ${coEsc(n.news_date || '')}</span>
                        <span><i class="fas fa-tag"></i> ${coEsc(n.category || '')}</span>
                        <span><i class="fas fa-building"></i> ${coEsc(n.source || '')}</span>
                    </div>
                </div>
            </div>`).join('');
    } catch (err) {
        container.innerHTML = coEmpty('fa-plug-circle-xmark', '资讯加载失败', err.message || '');
    }
}
