// co-common.js —— 共创相关页面的共用工具（状态徽章、进度条、时间格式化、登录守卫）
// 依赖：script.js（showToast/getUserData/getRelativePath）、api.js（window.API）

/* ---------------- 安全转义：所有来自后端/用户的文本都要过一遍 ---------------- */
function coEsc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------------- 状态元信息 ---------------- */
const CO_STATUS = {
  draft:       { text: '草稿',     color: 'var(--muted)',  bg: 'rgba(138,122,99,.12)', icon: 'fa-pen' },
  recruiting:  { text: '招募中',   color: 'var(--jade)',   bg: 'rgba(63,124,107,.12)', icon: 'fa-bullhorn' },
  in_progress: { text: '协作中',   color: 'var(--blue)',   bg: 'rgba(47,90,143,.12)',  icon: 'fa-people-group' },
  reviewing:   { text: '结项评审', color: 'var(--warning)',bg: 'rgba(208,138,46,.12)', icon: 'fa-clipboard-check' },
  closed:      { text: '已结项',   color: 'var(--gold)',   bg: 'rgba(193,154,75,.16)', icon: 'fa-trophy' },
  cancelled:   { text: '已取消',   color: 'var(--muted)',  bg: 'rgba(138,122,99,.12)', icon: 'fa-ban' },
};

const CO_TASK_STATUS = {
  todo:   { text: '待开始', color: 'var(--muted)',   bg: 'rgba(138,122,99,.12)' },
  doing:  { text: '进行中', color: 'var(--blue)',    bg: 'rgba(47,90,143,.12)' },
  review: { text: '待验收', color: 'var(--warning)', bg: 'rgba(208,138,46,.12)' },
  done:   { text: '已完成', color: 'var(--success)',  bg: 'rgba(47,143,95,.12)' },
};

const CO_MEMBER_STATUS = {
  pending:  { text: '待审核', color: 'var(--warning)', bg: 'rgba(208,138,46,.12)' },
  approved: { text: '已加入', color: 'var(--success)', bg: 'rgba(47,143,95,.12)' },
  rejected: { text: '已驳回', color: 'var(--muted)',   bg: 'rgba(138,122,99,.12)' },
  quit:     { text: '已退出', color: 'var(--muted)',   bg: 'rgba(138,122,99,.12)' },
  removed:  { text: '已移除', color: 'var(--danger)',  bg: 'rgba(176,36,90,.12)' },
};

function coStatusMeta(status) {
  return CO_STATUS[status] || { text: status || '未知', color: 'var(--muted)', bg: 'rgba(138,122,99,.12)', icon: 'fa-circle' };
}

/** 状态徽章 */
function coBadge(status) {
  const m = coStatusMeta(status);
  return `<span class="co-badge" style="color:${m.color};background:${m.bg};"><i class="fas ${m.icon}"></i> ${m.text}</span>`;
}

/** 通用小徽章 */
function coTag(text, color = 'var(--ink-3)', bg = 'var(--paper-2)') {
  return `<span class="co-badge" style="color:${color};background:${bg};">${coEsc(text)}</span>`;
}

/** 进度条 */
function coProgressBar(percent, opts = {}) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const color = opts.color || (p >= 100 ? 'var(--success)' : p >= 50 ? 'var(--blue)' : 'var(--gold)');
  return `<div class="co-progress" title="${p}%">
      <span style="width:${p}%;background:${color};"></span>
    </div>`;
}

/* ---------------- 时间 ---------------- */
function coDate(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return coEsc(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function coRelative(v) {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return coDate(v);
}

/** 距截止还有多久 */
function coDeadline(v) {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return `<span style="color:var(--muted);">已截止</span>`;
  if (days === 0) return `<span style="color:var(--danger);">今天截止</span>`;
  if (days <= 3) return `<span style="color:var(--danger);">剩 ${days} 天</span>`;
  return `<span style="color:var(--ink-3);">剩 ${days} 天</span>`;
}

function coInitial(name) {
  return coEsc((name || '?').trim().slice(0, 1));
}

/** 头像（没有就显示首字） */
function coAvatar(user, size = 36) {
  const n = (user && (user.displayName || user.username)) || '?';
  if (user && user.avatar) {
    return `<img class="co-avatar" style="width:${size}px;height:${size}px;" src="${coEsc(user.avatar)}" alt="${coEsc(n)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'co-avatar',style:'width:${size}px;height:${size}px',textContent:'${coInitial(n)}'}))">`;
  }
  return `<span class="co-avatar" style="width:${size}px;height:${size}px;">${coInitial(n)}</span>`;
}

/* ---------------- 骨架屏 / 空态 / 错误 ---------------- */
function coSkeleton(height = 120) {
  return `<div class="co-skeleton" style="height:${height}px;"></div>`;
}

function coEmpty(icon, title, desc, actionHtml = '') {
  return `<div class="co-empty">
      <i class="fas ${icon}"></i>
      <h3>${coEsc(title)}</h3>
      <p>${coEsc(desc)}</p>
      ${actionHtml}
    </div>`;
}

/** 统一的错误提示（含未登录/后端未启动的友好文案） */
function coHandleError(err, fallback = '加载失败') {
  const msg = (err && err.message) || fallback;
  if (typeof showToast === 'function') showToast(msg, 'error');
  else console.error(msg);
  return msg;
}

/* ---------------- 登录守卫 ---------------- */
/** 需要登录：未登录则跳登录页并带回跳地址 */
function coRequireLogin(redirectBack = true) {
  const u = typeof getUserData === 'function' ? getUserData() : null;
  if (u) return u;
  const back = redirectBack ? '?redirect=' + encodeURIComponent(location.href) : '';
  location.href = (typeof getRelativePath === 'function' ? getRelativePath('html/login.html') : 'login.html') + back;
  return null;
}

/** 角色判断 */
function coIsAdmin(u) { return u && u.role === 'admin'; }
function coCanCreate(u) { return u && (u.role === 'creator' || u.role === 'admin' || u.certStatus === 'approved'); }

/* ---------------- 公共样式（三个页面共用，避免改 style.css） ---------------- */
const CO_STYLE = `
<style>
.co-badge{display:inline-flex;align-items:center;gap:.35rem;padding:.22rem .6rem;border-radius:999px;font-size:.75rem;font-weight:600;line-height:1.4;white-space:nowrap;}
.co-progress{height:6px;background:var(--paper-3);border-radius:999px;overflow:hidden;}
.co-progress>span{display:block;height:100%;border-radius:999px;transition:width .4s ease;}
.co-avatar{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;font-weight:600;font-size:.85rem;object-fit:cover;flex:0 0 auto;}
.co-skeleton{background:linear-gradient(90deg,var(--paper-2) 25%,var(--paper-3) 37%,var(--paper-2) 63%);background-size:400% 100%;animation:coShimmer 1.4s ease infinite;border-radius:var(--radius);}
@keyframes coShimmer{0%{background-position:100% 50%}100%{background-position:0 50%}}
.co-empty{text-align:center;padding:3.5rem 1rem;color:var(--muted);}
.co-empty i{font-size:2.6rem;color:var(--paper-3);margin-bottom:1rem;display:block;}
.co-empty h3{font-family:var(--font-serif);color:var(--ink-2);margin-bottom:.5rem;}
.co-empty p{font-size:.9rem;margin-bottom:1rem;}
.co-card{background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:var(--transition);display:flex;flex-direction:column;}
.co-card:hover{box-shadow:var(--shadow-hover);transform:translateY(-3px);border-color:var(--gold-light);}
.co-card-cover{height:132px;position:relative;display:flex;align-items:flex-start;justify-content:flex-end;padding:.7rem;background:linear-gradient(135deg,var(--primary),var(--primary-dark));}
.co-card-body{padding:1rem 1.1rem 1.15rem;display:flex;flex-direction:column;gap:.55rem;flex:1;}
.co-card-title{font-family:var(--font-serif);font-size:1.02rem;color:var(--ink);line-height:1.45;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.co-card-desc{font-size:.85rem;color:var(--ink-3);line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1;}
.co-meta-row{display:flex;align-items:center;gap:.75rem;font-size:.78rem;color:var(--muted);flex-wrap:wrap;}
.co-meta-row i{color:var(--gold);}
.co-tabs{display:flex;gap:.25rem;border-bottom:2px solid var(--border);margin-bottom:1.5rem;overflow-x:auto;}
.co-tab{padding:.7rem 1.1rem;font-size:.92rem;font-weight:600;color:var(--ink-3);border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:var(--transition);}
.co-tab:hover{color:var(--primary);}
.co-tab.active{color:var(--primary);border-bottom-color:var(--primary);}
.co-panel{display:none;}
.co-panel.active{display:block;}
.co-list-item{display:flex;gap:1rem;padding:1rem;border:1px solid var(--border);border-radius:var(--radius);background:#fff;margin-bottom:.85rem;transition:var(--transition);}
.co-list-item:hover{border-color:var(--gold-light);box-shadow:var(--shadow);}
.co-list-main{flex:1;min-width:0;}
.co-kanban{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1rem;}
.co-kanban-col{background:var(--paper);border:1px solid var(--border);border-radius:var(--radius);padding:.85rem;min-height:120px;}
.co-kanban-head{display:flex;align-items:center;justify-content:space-between;font-size:.85rem;font-weight:700;color:var(--ink-2);margin-bottom:.75rem;}
.co-task{background:#fff;border:1px solid var(--border);border-radius:var(--radius-sm);padding:.7rem .8rem;margin-bottom:.6rem;}
.co-task-title{font-size:.88rem;font-weight:600;color:var(--ink);margin-bottom:.4rem;line-height:1.45;}
.co-discussion{display:flex;gap:.75rem;padding:.9rem 0;border-bottom:1px dashed var(--border);}
.co-discussion:last-child{border-bottom:none;}
.co-disc-body{flex:1;min-width:0;}
.co-disc-head{display:flex;align-items:center;gap:.5rem;font-size:.82rem;color:var(--muted);margin-bottom:.3rem;}
.co-disc-text{font-size:.9rem;color:var(--ink-2);line-height:1.65;white-space:pre-wrap;word-break:break-word;}
.co-disc-reply{background:var(--paper);border-left:3px solid var(--gold-light);padding:.45rem .6rem;border-radius:var(--radius-sm);font-size:.82rem;color:var(--ink-3);margin-bottom:.45rem;}
.co-version{position:relative;padding-left:1.6rem;padding-bottom:1.2rem;border-left:2px solid var(--border);}
.co-version:last-child{border-left-color:transparent;padding-bottom:0;}
.co-version::before{content:'';position:absolute;left:-7px;top:.3rem;width:12px;height:12px;border-radius:50%;background:var(--gold);border:2px solid #fff;box-shadow:0 0 0 2px var(--paper-3);}
.co-version.final::before{background:var(--success);}
.co-hero{background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;padding:2rem 0 2.4rem;position:relative;overflow:hidden;}
.co-hero::after{content:'';position:absolute;right:-60px;top:-60px;width:260px;height:260px;border-radius:50%;background:rgba(193,154,75,.18);}
.co-hero h1{font-family:var(--font-serif);font-size:1.85rem;margin:0 0 .6rem;line-height:1.35;position:relative;}
.co-side{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:1.2rem;}
.co-side-title{font-size:.85rem;font-weight:700;color:var(--ink-3);letter-spacing:.05em;margin-bottom:.9rem;}
.co-layout{display:grid;grid-template-columns:1fr 320px;gap:1.6rem;align-items:start;}
@media(max-width:900px){.co-layout{grid-template-columns:1fr;}}
.co-stat{display:flex;justify-content:space-between;font-size:.86rem;padding:.45rem 0;border-bottom:1px dashed var(--border);}
.co-stat:last-child{border-bottom:none;}
.co-stat b{color:var(--ink);}
.co-input{width:100%;padding:.6rem .8rem;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem;font-family:inherit;background:#fff;color:var(--ink);}
.co-input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(163,36,44,.08);}
.co-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.6rem 1.1rem;border-radius:var(--radius-sm);border:none;font-size:.9rem;font-weight:600;cursor:pointer;transition:var(--transition);font-family:inherit;}
.co-btn-primary{background:var(--primary);color:#fff;}
.co-btn-primary:hover{background:var(--primary-dark);}
.co-btn-gold{background:var(--gold);color:#fff;}
.co-btn-gold:hover{background:#a8843c;}
.co-btn-ghost{background:var(--paper-2);color:var(--ink-2);}
.co-btn-ghost:hover{background:var(--paper-3);}
.co-btn-sm{padding:.35rem .7rem;font-size:.8rem;}
.co-btn:disabled{opacity:.55;cursor:not-allowed;}
.co-warn{background:rgba(208,138,46,.1);border:1px solid rgba(208,138,46,.3);color:#8a5a1a;padding:.7rem .9rem;border-radius:var(--radius-sm);font-size:.85rem;line-height:1.6;}
.co-ok{background:rgba(47,143,95,.09);border:1px solid rgba(47,143,95,.28);color:#1f6b45;padding:.7rem .9rem;border-radius:var(--radius-sm);font-size:.85rem;line-height:1.6;}
</style>`;

/** 把公共样式注入 <head> */
function coInjectStyle() {
  if (document.getElementById('co-style')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = CO_STYLE;
  document.head.appendChild(wrap.firstElementChild);
  wrap.firstElementChild.id = 'co-style';
}
