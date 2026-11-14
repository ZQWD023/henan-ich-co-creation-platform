// auth.js - 登录 / 注册（河南省非遗共创平台）
//
// 这一版重点解决两个真实痛点：
//   1) 注册反复提示"已被注册"：现在会明确区分是**用户名**还是**邮箱**冲突，
//      并在邮箱冲突时直接给出"用这个邮箱登录"的入口（每个邮箱只能注册一个账号）；
//   2) 登录总提示"账号或密码错误"：后端现在支持**用邮箱登录**，前端也会给出提示；
//      另外注册页加了用户名/邮箱的实时可用性校验，填完之前就知道能不能用。

document.addEventListener('DOMContentLoaded', function () {
  const path = window.location.pathname;
  if (path.includes('login.html')) {
    initLoginForm();
    initLoginValidation();
  } else if (path.includes('register.html')) {
    initRegisterForm();
    initRegisterValidation();
  }
  checkRedirect();
});

/* ==================== 小工具 ==================== */
function setTip(id, text, level) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = text || '';
  el.style.color = level === 'ok' ? 'var(--success)' : level === 'warn' ? 'var(--warning)' : 'var(--danger)';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/** 优先展示后端给的 message；网络错误则给可操作的说明 */
function describeError(error) {
  if (!error) return '操作失败，请重试';
  if (error.network || !error.status || error.status === 404 || error.status === 405 || error.status === 502) {
    return '连不上后端服务（注册和登录都需要后端）。双击项目根目录的「启动网站.bat」启动服务后重试。';
  }
  if (error.status === 429) return '尝试次数过多，请等 15 分钟后再试。';
  if (error.status === 409) return error.message || '用户名或邮箱已被占用';
  if (error.status === 401) return error.message || '账号或密码错误';
  return error.message || '操作失败，请重试';
}

/** 展示消息（支持 HTML，用来自带"去登录/去注册"链接） */
function showMessage(el, html, type) {
  if (!el) return;
  el.innerHTML = html;
  el.className = 'message ' + type;
  el.style.display = 'block';
  if (type === 'error')
    setTimeout(() => {
      if (el.innerHTML === html) el.style.display = 'none';
    }, 12000);
}

/* ==================== 登录 ==================== */
function initLoginForm() {
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('login-message');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const raw = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    if (!raw || !password) {
      showMessage(msg, '请输入账号和密码', 'error');
      return;
    }

    const finish = (data) => {
      setToken(data.token);
      localStorage.setItem('henanICHCurrentUser', JSON.stringify(data.user));
      const redirect = new URLSearchParams(window.location.search).get('redirect');
      setTimeout(() => {
        window.location.href = redirect || '../index.html';
      }, 900);
    };

    try {
      const data = await window.API.auth.login(raw, password);
      finish(data);
      showMessage(
        msg,
        `登录成功，欢迎回来 <b>${escapeHtml(data.user.displayName || data.user.username)}</b>！正在跳转…`,
        'success'
      );
    } catch (error) {
      // 后端没启动、或部署在纯静态托管（Pages 下 /api/* 返回 404/405）时，用演示账号进离线模式
      const offline = window.OfflineStore && (error.network || !error.status || [404, 405, 502].includes(error.status));
      if (offline) {
        try {
          const data = window.OfflineStore.auth.login(raw, password);
          finish(data);
          showMessage(msg, '已进入离线演示模式，登录成功！正在跳转…', 'success');
          return;
        } catch (e2) {
          showMessage(
            msg,
            escapeHtml(e2.message) +
              '<br><small>离线模式下只能用演示账号：admin / creator / designer / writer / user，密码 123456</small>',
            'error'
          );
          return;
        }
      }

      const isAuthFail = error.status === 401;
      let html = escapeHtml(describeError(error));
      if (isAuthFail) {
        html +=
          '<div style="margin-top:6px;font-size:.82rem;line-height:1.7;">' +
          '· 用户名和<b>邮箱</b>都可以登录（如 <code>12345678</code> 或 <code>xxx@qq.com</code>）<br>' +
          '· 密码区分大小写，注意大小写锁定<br>' +
          '· 还没注册成功？<a href="register.html" style="color:var(--primary);text-decoration:underline;">去注册</a>' +
          '（同一个邮箱只能注册一个账号）</div>';
      }
      showMessage(msg, html, 'error');
    }
  });
}

function initLoginValidation() {
  const u = document.getElementById('login-username');
  const p = document.getElementById('login-password');
  if (u)
    u.addEventListener('input', function () {
      setTip('usernameTip', this.value.trim() ? '' : '账号不能为空');
    });
  if (p)
    p.addEventListener('input', function () {
      setTip('passwordTip', !this.value.trim() ? '密码不能为空' : this.value.length < 6 ? '密码不能少于6位' : '');
    });
}

/* ==================== 注册 ==================== */
function initRegisterForm() {
  const form = document.getElementById('registerForm');
  const msg = document.getElementById('register-message');
  if (!form) return;

  // 实时校验：用户名 / 邮箱是否已被占用（失焦时查一次，避免填完才被拒）
  bindAvailabilityCheck('register-username', 'usernameTip', 'username');
  bindAvailabilityCheck('register-email', 'emailTip', 'email');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim().toLowerCase();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm-password').value;

    if (!username || !email || !password || !confirm) {
      showMessage(msg, '请填写所有字段', 'error');
      return;
    }
    if (password !== confirm) {
      showMessage(msg, '两次输入的密码不一致', 'error');
      return;
    }
    if (password.length < 6) {
      showMessage(msg, '密码长度至少 6 位', 'error');
      return;
    }
    if (!isValidEmail(email)) {
      showMessage(msg, '请输入有效的邮箱地址', 'error');
      return;
    }
    if (username.length < 3) {
      showMessage(msg, '用户名至少需要 3 个字符', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '注册中…';
    }

    try {
      const data = await window.API.auth.register(username, email, password);
      setToken(data.token);
      localStorage.setItem('henanICHCurrentUser', JSON.stringify(data.user));
      showMessage(msg, '注册成功！正在跳转…', 'success');
      setTimeout(() => {
        window.location.href = '../index.html';
      }, 900);
    } catch (error) {
      const details = error.details || {};
      const fields = details.fields || [];

      // 字段级提示：告诉用户到底是谁被占用了
      if (fields.includes('email')) {
        setTip(
          'emailTip',
          `这个邮箱已经注册过账号${details.existingUsername ? `（${escapeHtml(details.existingUsername)}）` : ''}，每个邮箱只能注册一个账号`,
          'error'
        );
      } else if (document.getElementById('register-email')) {
        setTip('emailTip', '', 'ok');
      }
      if (fields.includes('username')) {
        setTip(
          'usernameTip',
          '该用户名已被占用' + (details.suggestion ? `，可以试试 <b>${escapeHtml(details.suggestion)}</b>` : ''),
          'error'
        );
      } else if (document.getElementById('register-username')) {
        setTip('usernameTip', '', 'ok');
      }

      let html = escapeHtml(describeError(error));
      if (fields.includes('email')) {
        const loginHref = 'login.html?u=' + encodeURIComponent(email);
        html += `<div style="margin-top:6px;font-size:.82rem;line-height:1.7;">
                    · 这个邮箱已经有一个账号了，可以直接 <a href="${loginHref}" style="color:var(--primary);text-decoration:underline;">用这个邮箱登录</a><br>
                    · 想再注册一个账号，请换一个没用过的邮箱（用户名可以和之前一样）</div>`;
        if (details.suggestion) {
          setTip('usernameTip', `可以试试 <b>${escapeHtml(details.suggestion)}</b>`, 'warn');
        }
      } else if (fields.includes('username')) {
        html += `<div style="margin-top:6px;font-size:.82rem;line-height:1.7;">
                    · 换一个用户名即可（邮箱不受影响）${details.suggestion ? `，建议试试 <b>${escapeHtml(details.suggestion)}</b>` : ''}</div>`;
      } else if (error.network || !error.status || [404, 405, 502].includes(error.status)) {
        html +=
          '<div style="margin-top:6px;font-size:.82rem;">双击项目根目录的 <b>启动网站.bat</b> 启动后端后再试。</div>';
      }
      showMessage(msg, html, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '注 册';
      }
    }
  });
}

/** 失焦时校验用户名/邮箱是否可用（带 800ms 防抖） */
function bindAvailabilityCheck(inputId, tipId, field) {
  const input = document.getElementById(inputId);
  if (!input) return;
  let timer = null;

  const run = async () => {
    const value = input.value.trim();
    if (!value) return;
    if (field === 'email' && !isValidEmail(value)) return;
    if (field === 'username' && value.length < 3) return;

    const params = field === 'username' ? { username: value } : { email: value.toLowerCase() };
    try {
      const res = await window.API.auth.check(params.username, params.email);
      const info = res && res[field];
      if (!info) return;
      if (field === 'username') {
        if (info.taken) {
          setTip(
            tipId,
            `该用户名已被占用${info.suggestion ? `，可以试试 <b>${escapeHtml(info.suggestion)}</b>` : ''}`,
            'error'
          );
        } else {
          setTip(tipId, '这个用户名可以用 ✓', 'ok');
        }
      } else if (info.taken) {
        setTip(
          tipId,
          `这个邮箱已注册过账号${info.existingUsername ? `（${escapeHtml(info.existingUsername)}）` : ''}，` +
            '<a href="login.html" style="color:var(--primary);text-decoration:underline;">去登录</a>',
          'error'
        );
      } else {
        setTip(tipId, '这个邮箱还没注册过 ✓', 'ok');
      }
    } catch (e) {
      /* 后端不可用时静默跳过，不打扰填写 */
    }
  };

  input.addEventListener('blur', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  });
  input.addEventListener('input', () => {
    clearTimeout(timer);
    if (input.value.trim().length === 0) setTip(tipId, '', 'ok');
  });
}

function initRegisterValidation() {
  const u = document.getElementById('register-username');
  const em = document.getElementById('register-email');
  const p = document.getElementById('register-password');
  const cp = document.getElementById('register-confirm-password');
  if (u)
    u.addEventListener('input', function () {
      if (this.value.trim().length === 0) return; // 空值提示由可用性校验负责
      const v = this.value.trim();
      if (v.length < 3) setTip('usernameTip', '用户名至少需要 3 个字符', 'error');
    });
  if (em)
    em.addEventListener('input', function () {
      const v = this.value.trim();
      if (v && !isValidEmail(v)) setTip('emailTip', '请输入有效的邮箱地址', 'error');
      else if (!v) setTip('emailTip', '', 'ok');
    });
  if (p)
    p.addEventListener('input', function () {
      const v = this.value.trim();
      setTip(
        'passwordTip',
        !v ? '密码不能为空' : v.length < 6 ? '密码至少需要 6 个字符' : '',
        v && v.length >= 6 ? 'ok' : 'error'
      );
    });
  if (cp)
    cp.addEventListener('input', function () {
      const v = this.value.trim();
      const pw = document.getElementById('register-password').value;
      setTip(
        'confirmPwdTip',
        !v ? '请确认密码' : v !== pw ? '两次输入的密码不一致' : '两次输入一致 ✓',
        v && v === pw ? 'ok' : 'error'
      );
    });
}

/* ==================== 其他 ==================== */
function generateUserId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 登录页支持 ?u=邮箱 预填（注册冲突时"用这个邮箱登录"会带过来） */
function prefillLoginFromQuery() {
  if (!window.location.pathname.includes('login.html')) return;
  const u = new URLSearchParams(window.location.search).get('u');
  const input = document.getElementById('login-username');
  if (u && input && !input.value) {
    input.value = u;
    const p = document.getElementById('login-password');
    if (p) p.focus();
  }
}

function checkRedirect() {
  prefillLoginFromQuery();
  const redirect = new URLSearchParams(window.location.search).get('redirect');
  if (redirect && localStorage.getItem('henanICHCurrentUser')) {
    const msg = document.getElementById('login-message') || document.getElementById('register-message');
    if (msg) {
      showMessage(msg, '您已登录，正在跳转…', 'success');
      setTimeout(() => {
        window.location.href = redirect;
      }, 900);
    }
  }
}

window.isValidEmail = isValidEmail;
window.showMessage = showMessage;
