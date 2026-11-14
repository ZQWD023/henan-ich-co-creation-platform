// co-project-detail.js —— 共创项目详情（申请 / 成员审批 / 任务看板 / 成果版本 / 讨论 / 状态流转）
let P = null; // 项目数据
let ME = null; // 当前用户
let DISCUSSIONS = []; // 讨论列表
let ACTIVE_TAB = 'brief';

document.addEventListener('DOMContentLoaded', async function () {
  coInjectStyle();
  if (typeof renderSiteHeader === 'function') renderSiteHeader('co-projects');
  if (typeof renderSiteFooter === 'function') renderSiteFooter();

  ME = typeof getUserData === 'function' ? getUserData() : null;

  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    document.getElementById('panel-brief').innerHTML = coEmpty(
      'fa-circle-question',
      '缺少项目 ID',
      '请从共创项目列表进入'
    );
    return;
  }
  P = { id };

  initDetailTabs();
  initModals();
  await load();
});

/* ==================== 数据加载 ==================== */
async function load() {
  try {
    // 后端没启动时（例如直接双击 index.html），用内置演示项目渲染同样的页面
    P = await window.OfflineStore.call(
      () => window.API.projects.detail(P.id),
      () => window.OfflineStore.projects.detail(P.id)
    );
    if (!P) throw Object.assign(new Error('项目不存在'), { status: 404 });
    try {
      // 离线/静态演示：讨论直接取本地演示数据，不再被清空
      const d = await window.OfflineStore.call(
        () => window.API.projects.discussions(P.id, { pageSize: 100 }),
        () => window.OfflineStore.projects.discussions(P.id)
      );
      DISCUSSIONS = (d && d.list) || [];
    } catch (e) {
      DISCUSSIONS = (P && P.discussions) || [];
    }
    renderAll();
    if (window.__offlineMode) {
      const brief = document.getElementById('panel-brief');
      if (brief) brief.insertAdjacentHTML('afterbegin', coOfflineNote('项目'));
    }
  } catch (err) {
    document.getElementById('hero-title').textContent = '加载失败';
    document.getElementById('panel-brief').innerHTML = coErrorPanel(err, '无法加载该项目', '项目数据');
    document.getElementById('side').innerHTML = '';
  }
}

function renderAll() {
  document.title = `${P.title} - 共创项目`;
  document.getElementById('crumb-name').textContent = P.title;
  renderHero();
  renderSide();
  renderBrief();
  renderMembers();
  renderTasks();
  renderVersions();
  renderDiscussions();
  document.getElementById('tab-members-count').textContent =
    `(${P.members.filter((m) => m.status === 'approved').length})`;
  document.getElementById('tab-tasks-count').textContent = `(${P.tasks.length})`;
  document.getElementById('tab-versions-count').textContent = `(${P.versions.length})`;
  document.getElementById('tab-disc-count').textContent = `(${DISCUSSIONS.length})`;
}

/* ==================== 顶部 ==================== */
function renderHero() {
  document.getElementById('hero-title').textContent = P.title;
  document.getElementById('hero-meta').innerHTML = `
        <span>${coBadge(P.status)}</span>
        <span><i class="fas fa-user-group"></i> ${P.membersCount}/${P.memberLimit} 名成员</span>
        <span><i class="fas fa-list-check"></i> 任务进度 ${P.progress}%</span>
        ${P.deadline ? `<span><i class="fas fa-hourglass-half"></i> ${coDeadline(P.deadline)}</span>` : ''}
        ${P.heritageName ? `<span><i class="fas fa-link"></i> ${coEsc(P.heritageName)}</span>` : ''}
    `;
}

/* ==================== 右栏：发起人 / 进度 / 操作 ==================== */
function renderSide() {
  const el = document.getElementById('side');
  const isOwner = ME && P.owner.id === ME.id;
  const approvedMembers = P.members.filter((m) => m.status === 'approved');
  const pendingMembers = P.members.filter((m) => m.status === 'pending');

  let actionHtml = '';

  // 1) 申请加入 / 已加入
  if (!ME) {
    actionHtml = `<a class="co-btn co-btn-primary" style="justify-content:center;" href="login.html?redirect=${encodeURIComponent(location.href)}">
            <i class="fas fa-right-to-bracket"></i> 登录后参与</a>`;
  } else if (isOwner) {
    actionHtml = `<div class="co-ok" style="text-align:center;"><i class="fas fa-crown"></i> 你是本项目发起人</div>`;
  } else if (P.myMemberStatus === 'approved') {
    actionHtml = `<div class="co-ok" style="text-align:center;"><i class="fas fa-user-check"></i> 你已是项目成员（${coEsc(P.myRole || '')}）</div>
            <button class="co-btn co-btn-ghost co-btn-sm" style="justify-content:center;" onclick="leaveProject()">退出项目</button>`;
  } else if (P.myMemberStatus === 'pending') {
    actionHtml = `<div class="co-warn" style="text-align:center;"><i class="fas fa-clock"></i> 申请已提交，等待发起人审核</div>`;
  } else if (P.canApply) {
    actionHtml = `<button class="co-btn co-btn-primary" style="justify-content:center;" onclick="openApply()">
            <i class="fas fa-hand"></i> 申请加入</button>`;
  } else if (P.status !== 'recruiting') {
    actionHtml = `<div class="co-warn" style="text-align:center;"><i class="fas fa-lock"></i> 该项目当前不在招募阶段</div>`;
  } else if (P.membersCount >= P.memberLimit) {
    actionHtml = `<div class="co-warn" style="text-align:center;"><i class="fas fa-users-slash"></i> 成员已满</div>`;
  }

  // 2) 发起人：状态流转
  let flowHtml = '';
  if (isOwner) {
    const nexts = (P.nextStatuses || []).filter((n) => n.status !== 'cancelled');
    if (nexts.length) {
      flowHtml = `<div class="co-side-title" style="margin-top:1.2rem;">项目流程</div>
                <div class="co-actions">
                ${nexts
                  .map(
                    (
                      n
                    ) => `<button class="co-btn co-btn-gold co-btn-sm" style="justify-content:center;" onclick="changeStatus('${n.status}')">
                    <i class="fas fa-arrow-right"></i> 转为「${coEsc(n.text)}」</button>`
                  )
                  .join('')}
                </div>`;
    }
    if (P.status !== 'closed' && P.status !== 'cancelled') {
      flowHtml += `<button class="co-btn co-btn-ghost co-btn-sm" style="justify-content:center;margin-top:.5rem;color:var(--danger);" onclick="changeStatus('cancelled')">
                <i class="fas fa-ban"></i> 取消项目</button>`;
    }
  }

  // 3) 成员：提交成果
  const canSubmitVersion =
    ME && (isOwner || P.myMemberStatus === 'approved') && !['closed', 'cancelled'].includes(P.status);

  el.innerHTML = `
        <div class="co-side-title">发起人</div>
        <div style="display:flex;align-items:center;gap:.7rem;margin-bottom:1.2rem;">
            ${coAvatar(P.owner, 44)}
            <div style="min-width:0;">
                <div style="font-weight:600;color:var(--ink);">${coEsc(P.owner.displayName)}</div>
                <div style="font-size:.78rem;color:var(--muted);">@${coEsc(P.owner.username || '')}</div>
            </div>
        </div>

        <div class="co-actions">${actionHtml}</div>

        ${flowHtml}

        <div class="co-side-title" style="margin-top:1.4rem;">项目进度</div>
        ${coProgressBar(P.progress)}
        <div class="co-stat"><span>任务完成</span><b>${P.taskStats.done} / ${P.taskStats.total}</b></div>
        <div class="co-stat"><span>评审中</span><b>${P.progressDetail.review}</b></div>
        <div class="co-stat"><span>成果版本</span><b>${P.versions.length}</b></div>
        <div class="co-stat"><span>已通过成员</span><b>${approvedMembers.length}</b></div>
        ${pendingMembers.length ? `<div class="co-stat"><span>待审申请</span><b style="color:var(--warning);">${pendingMembers.length}</b></div>` : ''}
        <div class="co-stat"><span>浏览</span><b>${P.viewsCount}</b></div>

        ${
          canSubmitVersion
            ? `<button class="co-btn co-btn-ghost co-btn-sm" style="justify-content:center;margin-top:1rem;width:100%;" onclick="openVersion()">
            <i class="fas fa-code-branch"></i> 提交成果版本</button>`
            : ''
        }

        <div class="co-side-title" style="margin-top:1.4rem;">项目信息</div>
        <div class="co-stat"><span>发起时间</span><b>${coDate(P.createdAt)}</b></div>
        ${P.deadline ? `<div class="co-stat"><span>截止时间</span><b>${coDate(P.deadline)}</b></div>` : ''}
        ${P.closedAt ? `<div class="co-stat"><span>结项时间</span><b>${coDate(P.closedAt)}</b></div>` : ''}
    `;
}

/* ==================== Tab 1：项目说明 ==================== */
function renderBrief() {
  const el = document.getElementById('panel-brief');
  const stages = ['recruiting', 'in_progress', 'reviewing', 'closed'];
  const idx = stages.indexOf(P.status);

  el.innerHTML = `
        <div class="co-flow">
            ${stages
              .map(
                (s, i) => `
                <span class="${i <= idx ? 'done' : ''}">${coStatusMeta(s).text}</span>
                ${i < stages.length - 1 ? '<i class="fas fa-chevron-right" style="font-size:.6rem;opacity:.5;"></i>' : ''}
            `
              )
              .join('')}
        </div>

        <div class="co-section-block">
            <h3><i class="fas fa-align-left"></i> 项目说明</h3>
            <div class="co-prose">${coEsc(P.description || '发起人暂未填写项目说明')}</div>
        </div>

        ${
          P.recruitNeed
            ? `<div class="co-section-block">
            <h3><i class="fas fa-bullhorn"></i> 招募要求</h3>
            <div class="co-prose">${coEsc(P.recruitNeed)}</div>
        </div>`
            : ''
        }

        <div class="co-section-block">
            <h3><i class="fas fa-lightbulb"></i> AI 共创建议</h3>
            <p style="font-size:.86rem;color:var(--muted);margin-bottom:.7rem;">
                让 AI 基于本非遗项目的真实元素，给出可落地的纹样与载体建议。
            </p>
            <button class="co-btn co-btn-ghost co-btn-sm" onclick="askAiIdea(this)">
                <i class="fas fa-wand-magic-sparkles"></i> 生成纹样创意建议
            </button>
            <div id="ai-idea" style="margin-top:1rem;"></div>
        </div>
    `;
}

async function askAiIdea(btn) {
  if (!P.heritageId) {
    showToast('该项目未关联非遗项目，无法生成针对性建议', 'error');
    return;
  }
  const box = document.getElementById('ai-idea');
  btn.disabled = true;
  box.innerHTML = coSkeleton(90);
  try {
    const r = await window.API.ai.patternIdea({ heritageId: P.heritageId, medium: '', audience: '' });
    box.innerHTML = `<div class="co-ok"><div class="co-prose">${coEsc(r.content)}</div>
            <div style="font-size:.75rem;color:var(--muted);margin-top:.6rem;">
                ${r.source === 'model' ? '由通义千问生成' : 'AI 未配置，当前为规则兜底内容'}
            </div></div>`;
  } catch (err) {
    box.innerHTML = `<div class="co-warn">${coEsc(err.message || 'AI 调用失败')}</div>`;
  } finally {
    btn.disabled = false;
  }
}

/* ==================== Tab 2：成员 ==================== */
function renderMembers() {
  const el = document.getElementById('panel-members');
  const isOwner = ME && P.owner.id === ME.id;

  // 发起人置顶
  const ownerRow = `
        <div class="co-member-row">
            ${coAvatar(P.owner, 40)}
            <div class="co-member-info">
                <div class="co-member-name">${coEsc(P.owner.displayName)} <span class="co-badge" style="color:var(--gold);background:rgba(193,154,75,.16);margin-left:.3rem;"><i class="fas fa-crown"></i> 发起人</span></div>
                <div class="co-member-sub">统筹 · 创建于 ${coDate(P.createdAt)}</div>
            </div>
        </div>`;

  const others = P.members.filter((m) => m.userId !== P.owner.id);
  const approved = others.filter((m) => m.status === 'approved');
  const pending = others.filter((m) => m.status === 'pending');
  const history = others.filter((m) => ['rejected', 'quit', 'removed'].includes(m.status));

  const rowHtml = (m, withActions) => {
    const st = CO_MEMBER_STATUS[m.status] || { text: m.status, color: 'var(--muted)', bg: 'transparent' };
    return `<div class="co-member-row">
            ${coAvatar({ displayName: m.displayName, avatar: m.avatar }, 40)}
            <div class="co-member-info">
                <div class="co-member-name">${coEsc(m.displayName)}
                    <span class="co-badge" style="color:${st.color};background:${st.bg};margin-left:.3rem;">${st.text}</span>
                </div>
                <div class="co-member-sub">
                    分工：${coEsc(m.role || '未分配')}
                    ${m.joinedAt ? ` · 加入于 ${coDate(m.joinedAt)}` : ''}
                    ${m.applyReason ? `<br>申请理由：${coEsc(m.applyReason)}` : ''}
                </div>
            </div>
            ${
              withActions
                ? `<div style="display:flex;gap:.4rem;">
                <button class="co-btn co-btn-primary co-btn-sm" onclick="reviewMember('${m.userId}','approved',this)">通过</button>
                <button class="co-btn co-btn-ghost co-btn-sm" onclick="reviewMember('${m.userId}','rejected',this)">驳回</button>
            </div>`
                : ''
            }
            ${isOwner && m.status === 'approved' ? `<button class="co-btn co-btn-ghost co-btn-sm" style="color:var(--danger);" onclick="removeMember('${m.userId}')">移除</button>` : ''}
        </div>`;
  };

  el.innerHTML = `
        ${
          isOwner && pending.length
            ? `<div class="co-section-block">
            <h3><i class="fas fa-inbox"></i> 待审核申请（${pending.length}）</h3>
            ${pending.map((m) => rowHtml(m, true)).join('')}
        </div>`
            : ''
        }

        <div class="co-section-block">
            <h3><i class="fas fa-user-group"></i> 项目成员（${approved.length + 1}）</h3>
            ${ownerRow}
            ${approved.map((m) => rowHtml(m, false)).join('')}
            ${approved.length === 0 ? `<p style="color:var(--muted);font-size:.86rem;padding:.6rem 0;">还没有其他成员加入，邀请同学一起共创吧。</p>` : ''}
        </div>

        ${
          history.length
            ? `<div class="co-section-block">
            <h3><i class="fas fa-clock-rotate-left"></i> 历史记录</h3>
            ${history.map((m) => rowHtml(m, false)).join('')}
        </div>`
            : ''
        }
    `;
}

/* ==================== Tab 3：任务看板 ==================== */
function renderTasks() {
  const el = document.getElementById('panel-tasks');
  const isOwner = ME && P.owner.id === ME.id;
  const isMember = ME && (isOwner || P.myMemberStatus === 'approved');
  const cols = [
    { key: 'todo', text: '待开始' },
    { key: 'doing', text: '进行中' },
    { key: 'review', text: '待验收' },
    { key: 'done', text: '已完成' },
  ];

  if (!isMember) {
    el.innerHTML = coEmpty('fa-lock', '任务看板仅成员可见', '申请加入项目后即可查看并领取任务');
    return;
  }

  const canCreate = isOwner && !['reviewing', 'closed', 'cancelled'].includes(P.status);

  el.innerHTML = `
        ${
          canCreate
            ? `<div class="co-compose" style="margin-bottom:1.2rem;">
            <div style="font-weight:600;font-size:.9rem;margin-bottom:.6rem;"><i class="fas fa-plus"></i> 新建任务并指派</div>
            <div style="display:grid;grid-template-columns:1fr 180px auto;gap:.6rem;align-items:center;">
                <input id="nt-title" class="co-input" placeholder="任务名称，例如：完成脸谱主视觉 3 稿" maxlength="60">
                <select id="nt-assignee" class="co-input">
                    <option value="">指派给…</option>
                    ${P.members
                      .filter((m) => m.status === 'approved')
                      .map(
                        (m) => `<option value="${coEsc(m.userId)}">${coEsc(m.displayName)}（${coEsc(m.role)}）</option>`
                      )
                      .join('')}
                </select>
                <button class="co-btn co-btn-primary" onclick="createTask(this)">添加</button>
            </div>
        </div>`
            : ''
        }

        <div class="co-kanban">
            ${cols
              .map((c) => {
                const tasks = P.tasks.filter((t) => t.status === c.key);
                return `<div class="co-kanban-col">
                    <div class="co-kanban-head">
                        <span>${CO_TASK_STATUS[c.key].text}</span>
                        <span style="color:var(--muted);font-weight:400;">${tasks.length}</span>
                    </div>
                    ${tasks.length ? tasks.map((t) => taskCard(t, isOwner, isMember)).join('') : `<div style="font-size:.8rem;color:var(--muted);text-align:center;padding:1rem 0;">暂无任务</div>`}
                </div>`;
              })
              .join('')}
        </div>
    `;
}

function taskCard(t, isOwner, isMember) {
  const st = CO_TASK_STATUS[t.status] || { text: t.status, color: 'var(--muted)', bg: 'transparent' };
  const mine = ME && t.assigneeId === ME.id;

  let actions = '';
  if (t.status === 'todo' && (mine || isOwner)) {
    actions += `<button class="co-btn co-btn-ghost co-btn-sm" onclick="updateTask('${t.id}',{status:'doing'})">开始</button>`;
  }
  if (t.status === 'doing' && (mine || isOwner)) {
    actions += `<button class="co-btn co-btn-ghost co-btn-sm" onclick="updateTask('${t.id}',{progress:100,submitContent:'成果已提交'})">标记完成</button>`;
  }
  if (t.status === 'review' && isOwner) {
    actions += `<button class="co-btn co-btn-primary co-btn-sm" onclick="updateTask('${t.id}',{status:'done'})">验收通过</button>`;
  }

  return `<div class="co-task">
        <div class="co-task-title">${coEsc(t.title)}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;">
            <span class="co-badge" style="color:${st.color};background:${st.bg};">${st.text}</span>
            <span style="font-size:.75rem;color:var(--muted);">${t.progress}%</span>
        </div>
        ${coProgressBar(t.progress, { color: st.color })}
        <div class="co-task-meta">
            ${t.assigneeName ? `<span>${coAvatar({ displayName: t.assigneeName, avatar: t.assigneeAvatar }, 20)} ${coEsc(t.assigneeName)}</span>` : '<span>未指派</span>'}
            ${t.deadline ? `<span>${coDeadline(t.deadline)}</span>` : ''}
        </div>
        ${t.submitContent ? `<div style="font-size:.78rem;color:var(--ink-3);margin-top:.45rem;background:var(--paper);padding:.4rem .55rem;border-radius:6px;">提交：${coEsc(t.submitContent)}</div>` : ''}
        ${actions ? `<div style="display:flex;gap:.4rem;margin-top:.6rem;">${actions}</div>` : ''}
    </div>`;
}

/* ==================== Tab 4：成果版本 ==================== */
function renderVersions() {
  const el = document.getElementById('panel-versions');
  const isOwner = ME && P.owner.id === ME.id;
  const canSubmit = ME && (isOwner || P.myMemberStatus === 'approved') && !['closed', 'cancelled'].includes(P.status);

  if (!P.versions.length) {
    el.innerHTML = coEmpty(
      'fa-code-branch',
      '还没有成果版本',
      '每次迭代都可以提交一个版本，历史版本会一直保留',
      canSubmit
        ? `<button class="co-btn co-btn-primary" onclick="openVersion()"><i class="fas fa-plus"></i> 提交第一个版本</button>`
        : ''
    );
    return;
  }

  el.innerHTML = `
        ${canSubmit ? `<div style="margin-bottom:1rem;"><button class="co-btn co-btn-primary co-btn-sm" onclick="openVersion()"><i class="fas fa-plus"></i> 提交新版本</button></div>` : ''}
        ${P.versions
          .map(
            (v) => `
            <div class="co-version ${v.isFinal ? 'final' : ''}">
                <div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.35rem;">
                    <b style="font-size:.95rem;color:var(--ink);">v${v.versionNo} · ${coEsc(v.title)}</b>
                    ${v.isFinal ? `<span class="co-badge" style="color:var(--success);background:rgba(47,143,95,.12);"><i class="fas fa-star"></i> 最终版</span>` : ''}
                    ${isOwner && !v.isFinal ? `<button class="co-btn co-btn-ghost co-btn-sm" onclick="markFinal('${v.id}')">设为最终版</button>` : ''}
                </div>
                <div style="font-size:.78rem;color:var(--muted);margin-bottom:.45rem;">
                    ${coEsc(v.submitterName || '成员')} · ${coDate(v.createdAt)}
                </div>
                ${v.content ? `<div class="co-prose" style="font-size:.88rem;">${coEsc(v.content)}</div>` : ''}
            </div>`
          )
          .join('')}
    `;
}

/* ==================== Tab 5：讨论 ==================== */
function renderDiscussions() {
  const el = document.getElementById('panel-discussions');
  const canPost = ME && (P.owner.id === ME.id || P.myMemberStatus === 'approved');

  el.innerHTML = `
        ${
          DISCUSSIONS.length
            ? DISCUSSIONS.map(
                (d) => `
            <div class="co-discussion">
                ${coAvatar({ displayName: d.userName, avatar: d.userAvatar }, 36)}
                <div class="co-disc-body">
                    <div class="co-disc-head">
                        <b style="color:var(--ink-2);">${coEsc(d.userName)}</b>
                        <span>${coRelative(d.createdAt)}</span>
                        ${d.mentions && d.mentions.length ? `<span class="co-badge" style="color:var(--blue);background:rgba(47,90,143,.1);">@ ${d.mentions.length} 人</span>` : ''}
                    </div>
                    ${d.replyContent ? `<div class="co-disc-reply">回复 ${coEsc(d.replyUser || '')}：${coEsc(d.replyContent)}</div>` : ''}
                    <div class="co-disc-text">${coEsc(d.content)}</div>
                </div>
            </div>`
              ).join('')
            : `<p style="color:var(--muted);font-size:.88rem;padding:.5rem 0;">还没有讨论，成员可以在这里同步进度、@ 相关成员。</p>`
        }

        ${
          canPost
            ? `<div class="co-compose">
            <textarea id="disc-input" placeholder="同步一下进度，或用 @ 提醒成员（例如：@林一设计 草图好了吗）"></textarea>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.6rem;gap:.6rem;flex-wrap:wrap;">
                <span style="font-size:.78rem;color:var(--muted);">提示：在内容里写 @昵称 会自动通知该成员</span>
                <button class="co-btn co-btn-primary co-btn-sm" onclick="postDiscussion(this)"><i class="fas fa-paper-plane"></i> 发布</button>
            </div>
        </div>`
            : `<div class="co-warn" style="margin-top:1rem;"><i class="fas fa-lock"></i> 加入项目后才能参与讨论</div>`
        }
    `;
}

/* ==================== 交互动作 ==================== */
function switchTab(name) {
  ACTIVE_TAB = name;
  document.querySelectorAll('.co-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.co-panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
}

function initDetailTabs() {
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.co-tab');
    if (btn) switchTab(btn.dataset.tab);
  });
}

function initModals() {
  const applyModal = document.getElementById('apply-modal');
  const versionModal = document.getElementById('version-modal');
  const close = (m) => m.classList.remove('show');

  document.getElementById('apply-close').addEventListener('click', () => close(applyModal));
  document.getElementById('apply-cancel').addEventListener('click', () => close(applyModal));
  applyModal.addEventListener('click', (e) => {
    if (e.target === applyModal) close(applyModal);
  });

  document.getElementById('version-close').addEventListener('click', () => close(versionModal));
  document.getElementById('version-cancel').addEventListener('click', () => close(versionModal));
  versionModal.addEventListener('click', (e) => {
    if (e.target === versionModal) close(versionModal);
  });

  document.getElementById('apply-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = document.getElementById('a-submit');
    btn.disabled = true;
    try {
      await window.OfflineStore.call(
        () =>
          window.API.projects.apply(
            P.id,
            document.getElementById('a-role').value,
            document.getElementById('a-reason').value.trim()
          ),
        () =>
          window.OfflineStore.projects.apply(
            P.id,
            document.getElementById('a-role').value,
            document.getElementById('a-reason').value.trim()
          )
      );
      close(applyModal);
      showToast('申请已提交，等待发起人审核');
      await load();
    } catch (err) {
      coHandleError(err, '申请失败');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('version-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = document.getElementById('v-submit');
    const title = document.getElementById('v-title').value.trim();
    if (title.length < 2) return showToast('成果标题至少 2 个字', 'error');
    btn.disabled = true;
    try {
      await window.API.projects.createVersion(P.id, {
        title,
        content: document.getElementById('v-content').value.trim(),
      });
      close(versionModal);
      document.getElementById('version-form').reset();
      showToast('成果版本已提交');
      switchTab('versions');
      await load();
    } catch (err) {
      coHandleError(err, '提交失败');
    } finally {
      btn.disabled = false;
    }
  });
}

function openApply() {
  if (!coRequireLogin()) return;
  document.getElementById('apply-modal').classList.add('show');
}

function openVersion() {
  if (!coRequireLogin()) return;
  document.getElementById('version-modal').classList.add('show');
}

async function reviewMember(userId, decision, btn) {
  if (btn) btn.disabled = true;
  try {
    await window.API.projects.reviewMember(P.id, userId, decision);
    showToast(decision === 'approved' ? '已通过申请' : '已驳回申请');
    await load();
    switchTab('members');
  } catch (err) {
    coHandleError(err, '审核失败');
    if (btn) btn.disabled = false;
  }
}

async function removeMember(userId) {
  showConfirmDialog('移除成员', '确定将该成员移出项目吗？', async () => {
    try {
      await window.API.projects.removeMember(P.id, userId);
      showToast('成员已移除');
      await load();
      switchTab('members');
    } catch (err) {
      coHandleError(err, '移除失败');
    }
  });
}

async function leaveProject() {
  showConfirmDialog('退出项目', '退出后将无法查看任务看板，确定吗？', async () => {
    try {
      await window.API.projects.leave(P.id);
      showToast('已退出项目');
      await load();
    } catch (err) {
      coHandleError(err, '退出失败');
    }
  });
}

async function changeStatus(status) {
  const label = coStatusMeta(status).text;
  showConfirmDialog('变更项目状态', `确定要将项目转为「${label}」吗？`, async () => {
    try {
      await window.API.projects.changeStatus(P.id, status);
      showToast(`项目已进入「${label}」`);
      await load();
    } catch (err) {
      coHandleError(err, '状态变更失败');
    }
  });
}

async function createTask(btn) {
  const title = document.getElementById('nt-title').value.trim();
  if (title.length < 2) return showToast('任务名称至少 2 个字', 'error');
  const assigneeId = document.getElementById('nt-assignee').value || undefined;
  btn.disabled = true;
  try {
    await window.API.projects.createTask(P.id, { title, assigneeId });
    document.getElementById('nt-title').value = '';
    showToast('任务已创建');
    await load();
    switchTab('tasks');
  } catch (err) {
    coHandleError(err, '创建任务失败');
  } finally {
    btn.disabled = false;
  }
}

async function updateTask(taskId, patch) {
  try {
    await window.API.projects.updateTask(taskId, patch);
    showToast('任务已更新');
    await load();
    switchTab('tasks');
  } catch (err) {
    coHandleError(err, '更新失败');
  }
}

async function markFinal(versionId) {
  try {
    await window.API.projects.markFinal(P.id, versionId);
    showToast('已设为最终版本');
    await load();
    switchTab('versions');
  } catch (err) {
    coHandleError(err, '设置失败');
  }
}

async function postDiscussion(btn) {
  const input = document.getElementById('disc-input');
  const content = input.value.trim();
  if (!content) return showToast('请输入内容', 'error');

  // 从 "@昵称" 里解析出成员 ID，用于触发通知
  const mentions = [];
  P.members.forEach((m) => {
    if (content.includes('@' + m.displayName)) mentions.push(m.userId);
  });

  btn.disabled = true;
  try {
    await window.API.projects.createDiscussion(P.id, { content, mentions });
    input.value = '';
    showToast('已发布');
    await load();
    switchTab('discussions');
  } catch (err) {
    coHandleError(err, '发布失败');
  } finally {
    btn.disabled = false;
  }
}
