// my-workspace.js —— 我的共创工作台
let WS = null;
let ME = null;

document.addEventListener('DOMContentLoaded', async function () {
    coInjectStyle();
    if (typeof renderSiteHeader === 'function') renderSiteHeader('workspace');
    if (typeof renderSiteFooter === 'function') renderSiteFooter();

    ME = typeof getUserData === 'function' ? getUserData() : null;
    if (!ME) {
        document.getElementById('ws-root').innerHTML = coEmpty(
            'fa-user-lock',
            '请先登录',
            '登录后即可查看你发起的项目、参与的项目与待办任务',
            `<a class="co-btn co-btn-primary" href="login.html?redirect=${encodeURIComponent(location.href)}">去登录</a>`
        );
        return;
    }
    await load();
});

async function load() {
    const root = document.getElementById('ws-root');
    try {
        WS = await window.API.projects.myWorkspace();
        render();
    } catch (err) {
        root.innerHTML = coEmpty(
            'fa-plug-circle-xmark',
            '加载失败',
            err.message || '请确认后端服务已启动',
            `<button class="co-btn co-btn-primary" onclick="location.reload()">重试</button>`
        );
    }
}

function render() {
    const root = document.getElementById('ws-root');
    const s = WS.summary;
    const greet = ME.displayName || ME.username;

    root.innerHTML = `
        <div style="margin-bottom:1.2rem;font-size:.9rem;color:var(--ink-3);">
            <i class="fas fa-hand-sparkles" style="color:var(--gold)"></i>
            你好，<b>${coEsc(greet)}</b>。${s.pendingApplyCount > 0 ? `有 <b style="color:var(--warning)">${s.pendingApplyCount}</b> 个申请等你审核，` : ''}${s.todoTaskCount > 0 ? `<b style="color:var(--blue)">${s.todoTaskCount}</b> 个任务等你动手。` : '暂时没有待办。'}
        </div>

        <div class="ws-stats">
            <a class="ws-stat" href="#owned"><div class="ws-stat-num">${s.ownedCount}</div><div class="ws-stat-label"><i class="fas fa-crown"></i> 我发起的项目</div></a>
            <a class="ws-stat" href="#joined"><div class="ws-stat-num">${s.joinedCount}</div><div class="ws-stat-label"><i class="fas fa-user-group"></i> 我参与的项目</div></a>
            <a class="ws-stat" href="#apply"><div class="ws-stat-num" style="${s.pendingApplyCount ? 'color:var(--warning)' : ''}">${s.pendingApplyCount}</div><div class="ws-stat-label"><i class="fas fa-inbox"></i> 待我审核的申请</div></a>
            <a class="ws-stat" href="#tasks"><div class="ws-stat-num" style="${s.todoTaskCount ? 'color:var(--blue)' : ''}">${s.todoTaskCount}</div><div class="ws-stat-label"><i class="fas fa-list-check"></i> 我的待办任务</div></a>
        </div>

        ${blockApply()}
        ${blockTasks()}
        ${blockOwned()}
        ${blockJoined()}
    `;
}

/* ---------------- 待我审核的申请 ---------------- */
function blockApply() {
    const list = WS.pendingApplications || [];
    return `<div class="ws-block" id="apply">
        <div class="ws-block-title">
            <span><i class="fas fa-inbox"></i> 待我审核的申请 <span class="ws-count">（${list.length}）</span></span>
            ${list.length ? '<span class="co-badge" style="color:var(--warning);background:rgba(208,138,46,.12);"><i class="fas fa-bell"></i> 需要处理</span>' : ''}
        </div>
        ${list.length ? list.map((a) => `
            <div class="ws-item">
                <div class="ws-item-main">
                    <div class="ws-item-title">
                        <b>${coEsc(a.applicant || '用户')}</b> 申请加入
                        <a href="co-project-detail.html?id=${encodeURIComponent(a.project_id)}">${coEsc(a.project_title)}</a>
                    </div>
                    <div class="ws-item-sub">
                        <span><i class="fas fa-tag"></i> 意向分工：${coEsc(a.role || '未填')}</span>
                        <span><i class="fas fa-clock"></i> ${coRelative(a.joined_at)}</span>
                        ${a.apply_reason ? `<span><i class="fas fa-comment"></i> ${coEsc(a.apply_reason)}</span>` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:.4rem;flex:0 0 auto;">
                    <button class="co-btn co-btn-primary co-btn-sm" onclick="review('${a.project_id}','${a.user_id}','approved',this)">通过</button>
                    <button class="co-btn co-btn-ghost co-btn-sm" onclick="review('${a.project_id}','${a.user_id}','rejected',this)">驳回</button>
                </div>
            </div>`).join('') : `<p style="font-size:.86rem;color:var(--muted);margin:0;">没有待审核的申请。</p>`}
    </div>`;
}

/* ---------------- 我的待办任务 ---------------- */
function blockTasks() {
    const list = WS.todoTasks || [];
    return `<div class="ws-block" id="tasks">
        <div class="ws-block-title">
            <span><i class="fas fa-list-check"></i> 我的待办任务 <span class="ws-count">（${list.length}）</span></span>
        </div>
        ${list.length ? list.map((t) => {
            const st = CO_TASK_STATUS[t.status] || { text: t.status, color: 'var(--muted)', bg: 'transparent' };
            return `<div class="ws-item">
                <div class="ws-item-main">
                    <div class="ws-item-title">${coEsc(t.title)}</div>
                    <div class="ws-item-sub">
                        <a href="co-project-detail.html?id=${encodeURIComponent(t.projectId)}" style="color:var(--primary);text-decoration:none;">
                            <i class="fas fa-folder"></i> ${coEsc(t.projectTitle || '所属项目')}
                        </a>
                        <span class="co-badge" style="color:${st.color};background:${st.bg};">${st.text}</span>
                        ${t.deadline ? `<span>${coDeadline(t.deadline)}</span>` : ''}
                    </div>
                </div>
                <div class="ws-progress-mini">
                    ${coProgressBar(t.progress, { color: st.color })}
                    <div style="font-size:.72rem;color:var(--muted);text-align:right;margin-top:.2rem;">${t.progress}%</div>
                </div>
                <div style="display:flex;gap:.4rem;flex:0 0 auto;">
                    ${t.status === 'todo' ? `<button class="co-btn co-btn-ghost co-btn-sm" onclick="taskAct('${t.id}',{status:'doing'},this)">开始</button>` : ''}
                    ${t.status === 'doing' ? `<button class="co-btn co-btn-primary co-btn-sm" onclick="taskAct('${t.id}',{progress:100,submitContent:'成果已提交'},this)">完成</button>` : ''}
                    ${t.status === 'review' ? `<span style="font-size:.78rem;color:var(--warning);">等待发起人验收</span>` : ''}
                </div>
            </div>`;
        }).join('') : `<p style="font-size:.86rem;color:var(--muted);margin:0;">没有待办任务。去 <a href="co-projects.html" style="color:var(--primary);">共创项目</a> 看看有没有感兴趣的项目。</p>`}
    </div>`;
}

/* ---------------- 我发起的 / 我参与的 ---------------- */
function projectRow(p, extra = '') {
    return `<div class="ws-item">
        <div class="ws-item-main">
            <div class="ws-item-title">
                <a href="co-project-detail.html?id=${encodeURIComponent(p.id)}">${coEsc(p.title)}</a>
            </div>
            <div class="ws-item-sub">
                ${coBadge(p.status)}
                <span><i class="fas fa-user-group"></i> ${p.membersCount}/${p.memberLimit}</span>
                <span><i class="fas fa-list-check"></i> 任务 ${p.taskStats.done}/${p.taskStats.total}</span>
                ${p.deadline ? `<span>${coDeadline(p.deadline)}</span>` : ''}
                ${extra}
            </div>
        </div>
        <div class="ws-progress-mini">${coProgressBar(p.progress)}</div>
    </div>`;
}

function blockOwned() {
    const list = WS.owned || [];
    return `<div class="ws-block" id="owned">
        <div class="ws-block-title">
            <span><i class="fas fa-crown"></i> 我发起的项目 <span class="ws-count">（${list.length}）</span></span>
            <a class="co-btn co-btn-ghost co-btn-sm" href="co-projects.html"><i class="fas fa-plus"></i> 发起新项目</a>
        </div>
        ${list.length ? list.map((p) => projectRow(p)).join('') : `<p style="font-size:.86rem;color:var(--muted);margin:0;">还没有发起过项目。</p>`}
    </div>`;
}

function blockJoined() {
    const list = WS.joined || [];
    return `<div class="ws-block" id="joined">
        <div class="ws-block-title">
            <span><i class="fas fa-user-group"></i> 我参与的项目 <span class="ws-count">（${list.length}）</span></span>
        </div>
        ${list.length ? list.map((p) => projectRow(p)).join('') : `<p style="font-size:.86rem;color:var(--muted);margin:0;">还没有参与别人的项目。<a href="co-projects.html" style="color:var(--primary);">去找一个</a></p>`}
    </div>`;
}

/* ---------------- 动作 ---------------- */
async function review(projectId, userId, decision, btn) {
    if (btn) btn.disabled = true;
    try {
        await window.API.projects.reviewMember(projectId, userId, decision);
        showToast(decision === 'approved' ? '已通过申请' : '已驳回申请');
        await load();
    } catch (err) {
        coHandleError(err, '审核失败');
        if (btn) btn.disabled = false;
    }
}

async function taskAct(taskId, patch, btn) {
    if (btn) btn.disabled = true;
    try {
        await window.API.projects.updateTask(taskId, patch);
        showToast('任务已更新');
        await load();
    } catch (err) {
        coHandleError(err, '更新失败');
        if (btn) btn.disabled = false;
    }
}
