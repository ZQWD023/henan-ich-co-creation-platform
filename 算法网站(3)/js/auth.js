// auth.js - 登录/注册功能（河南省非遗共创平台）

document.addEventListener('DOMContentLoaded', function () {
    const path = window.location.pathname;
    if (path.includes('login.html')) { initLoginForm(); initLoginValidation(); }
    else if (path.includes('register.html')) { initRegisterForm(); initRegisterValidation(); }
    checkRedirect();
});

function initLoginForm() {
    const form = document.getElementById('loginForm');
    const msg = document.getElementById('login-message');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        if (!username || !password) { showMessage(msg, '请输入用户名和密码', 'error'); return; }

        try {
            const data = await window.API.auth.login(username, password);

            // 保存 token 和用户信息
            setToken(data.token);
            localStorage.setItem('henanICHCurrentUser', JSON.stringify(data.user));

            showMessage(msg, '登录成功！正在跳转...', 'success');
            const redirect = new URLSearchParams(window.location.search).get('redirect');
            setTimeout(() => { window.location.href = redirect || '../index.html'; }, 1200);
        } catch (error) {
            showMessage(msg, error.message || '登录失败', 'error');
        }
    });
}

function initLoginValidation() {
    const u = document.getElementById('login-username');
    const p = document.getElementById('login-password');
    if (u) u.addEventListener('input', function () { setTip('usernameTip', this.value.trim() ? '' : '用户名不能为空'); });
    if (p) p.addEventListener('input', function () {
        setTip('passwordTip', !this.value.trim() ? '密码不能为空' : (this.value.length < 6 ? '密码不能少于6位' : ''));
    });
}

function initRegisterForm() {
    const form = document.getElementById('registerForm');
    const msg = document.getElementById('register-message');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm-password').value;
        if (!username || !email || !password || !confirm) { showMessage(msg, '请填写所有字段', 'error'); return; }
        if (password !== confirm) { showMessage(msg, '两次输入的密码不一致', 'error'); return; }
        if (password.length < 6) { showMessage(msg, '密码长度至少6位', 'error'); return; }
        if (!isValidEmail(email)) { showMessage(msg, '请输入有效的邮箱地址', 'error'); return; }
        if (username.length < 3) { showMessage(msg, '用户名至少需要3个字符', 'error'); return; }

        try {
            const data = await window.API.auth.register(username, email, password);

            // 保存 token 和用户信息
            setToken(data.token);
            localStorage.setItem('henanICHCurrentUser', JSON.stringify(data.user));

            showMessage(msg, '注册成功！正在跳转...', 'success');
            setTimeout(() => { window.location.href = '../index.html'; }, 1200);
        } catch (error) {
            showMessage(msg, error.message || '注册失败', 'error');
        }
    });
}

function initRegisterValidation() {
    const u = document.getElementById('register-username');
    const em = document.getElementById('register-email');
    const p = document.getElementById('register-password');
    const cp = document.getElementById('register-confirm-password');
    if (u) u.addEventListener('input', function () {
        const v = this.value.trim();
        setTip('usernameTip', !v ? '用户名不能为空' : (v.length < 3 ? '用户名至少需要3个字符' : ''));
    });
    if (em) em.addEventListener('input', function () {
        const v = this.value.trim();
        setTip('emailTip', !v ? '邮箱不能为空' : (!isValidEmail(v) ? '请输入有效的邮箱地址' : ''));
    });
    if (p) p.addEventListener('input', function () {
        const v = this.value.trim();
        setTip('passwordTip', !v ? '密码不能为空' : (v.length < 6 ? '密码至少需要6个字符' : ''));
    });
    if (cp) cp.addEventListener('input', function () {
        const v = this.value.trim();
        const pw = document.getElementById('register-password').value;
        setTip('confirmPwdTip', !v ? '请确认密码' : (v !== pw ? '两次输入的密码不一致' : ''));
    });
}

function setTip(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = 'message ' + type;
    el.style.display = 'block';
    if (type === 'error') setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function checkRedirect() {
    const redirect = new URLSearchParams(window.location.search).get('redirect');
    if (redirect && localStorage.getItem('henanICHCurrentUser')) {
        const msg = document.getElementById('login-message') || document.getElementById('register-message');
        if (msg) { showMessage(msg, '您已登录，正在跳转...', 'success'); setTimeout(() => { window.location.href = redirect; }, 1200); }
    }
}

window.isValidEmail = isValidEmail;
window.showMessage = showMessage;
