// api.js - 后端 API 统一封装（v3）
// 所有页面只需引入本文件，即可通过 window.API.xxx 调用后端
// 约定：后端统一返回 { code, message, data }，code === 0 视为成功
//
// v3 变化：
// 1. 站点一般由后端（server.js）同源提供，API 走同源 /api，不会出现跨域/连不上的问题；
// 2. 网络抖动时自动重试 3 次，仍失败也只给"服务连接中"的友好提示，
//    不会再弹出"请确认后端已启动（npm start）"这类吓人的文案；
// 3. 暴露 window.APIOnline / window.ensureBackend() 供页面做"连上后自动恢复"。
const API_BASE_URL = (function () {
    if (location.protocol === 'file:') {
        return 'http://localhost:3000/api';
    }
    // 兼容本机 VS Code Live Server 等静态服务器：此时页面在 55xx/8080 等端口，
    // 而 API 由 3000 端口提供。
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal && location.port && location.port !== '3000') {
        return `http://${location.hostname}:3000/api`;
    }
    return `${location.origin}/api`;
})();

// API 服务根地址（用于 /health 探活）
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

const TOKEN_KEY = 'henanICHToken';
const USER_KEY = 'henanICHCurrentUser';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 带重试的 fetch：只对"网络层失败"重试，HTTP 错误交给业务处理 */
async function fetchWithRetry(url, options = {}, retries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fetch(url, options);
        } catch (err) {
            lastError = err;
            if (attempt < retries) await sleep(320 * (attempt + 1));
        }
    }
    throw lastError;
}

/**
 * 通用请求
 * @param {string} endpoint 形如 '/auth/login'
 * @param {object} options  fetch 选项，body 直接传对象，内部自动 JSON.stringify
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = { ...(options.headers || {}) };

    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
    }

    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let response;
    try {
        response = await fetchWithRetry(url, { ...options, headers, body });
        window.APIOnline = true;
    } catch (err) {
        window.APIOnline = false;
        // 只说明"暂时没连上"，不给用户布置技术作业
        const friendly = new Error('服务正在连接，请稍候再试一次');
        friendly.network = true;
        friendly.cause = err;
        throw friendly;
    }

    let json = null;
    try { json = await response.json(); } catch (e) { json = null; }

    if (!response.ok) {
        // 401/403 统一清理登录态
        if (response.status === 401) clearToken();
        const msg = (json && (json.message || json.error)) || `请求失败（HTTP ${response.status}）`;
        const err = new Error(msg);
        err.status = response.status;
        err.code = json && json.code;
        err.details = json && json.details;
        throw err;
    }

    // 兼容两种返回：{code,message,data} 与直接对象
    if (json && typeof json.code === 'number') {
        if (json.code !== 0) {
            const err = new Error(json.message || '请求失败');
            err.code = json.code;
            err.details = json.details;
            throw err;
        }
        return json.data;
    }
    return json;
}

const qs = (params = {}) => {
    const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
    return clean.length ? '?' + new URLSearchParams(clean).toString() : '';
};

window.API = {
    /* ---------------- 认证 ---------------- */
    auth: {
        register: (username, email, password) =>
            apiRequest('/auth/register', { method: 'POST', body: { username, email, password } }),

        login: async (username, password) => {
            const data = await apiRequest('/auth/login', { method: 'POST', body: { username, password } });
            // 登录成功后立刻拉取"我的收藏 / 点赞"，让各页面首屏就能显示正确状态
            try {
                setToken(data.token);
                const [favs, likes] = await Promise.all([
                    apiRequest('/interactions/mine?targetType=heritage&action=favorite'),
                    apiRequest('/interactions/mine?targetType=work&action=like'),
                ]);
                data.user = data.user || {};
                data.user.favorites = Array.isArray(favs) ? favs : [];
                data.user.likes = Array.isArray(likes) ? likes : [];
            } catch (e) {
                /* 拉取失败不影响登录 */
            }
            return data;
        },

        me: () => apiRequest('/auth/me'),

        /** 修改密码（替代原来的 localStorage 明文逻辑） */
        changePassword: (oldPassword, newPassword) =>
            apiRequest('/auth/password', { method: 'PUT', body: { oldPassword, newPassword } }),

        forgotPassword: (username, email) =>
            apiRequest('/auth/forgot-password', { method: 'POST', body: { username, email } }),

        resetPassword: (resetToken, newPassword) =>
            apiRequest('/auth/reset-password', { method: 'POST', body: { resetToken, newPassword } }),

        deleteAccount: (password) =>
            apiRequest('/auth/account', { method: 'DELETE', body: { password } }),

        /** 注册页实时校验：用户名 / 邮箱是否已被占用 */
        check: (username, email) => apiRequest('/auth/check' + qs({ username, email })),

        logout: () => {
            clearToken();
            window.location.href = '../index.html';
        }
    },

    /* ---------------- 用户 ---------------- */
    users: {
        me: () => apiRequest('/users/me'),
        update: (data) => apiRequest('/users/me', { method: 'PUT', body: data }),
        profile: (userId) => apiRequest(`/users/${userId}`),
        favorites: (type = 'project') => apiRequest(`/users/me/favorites${qs({ type })}`),

        applyCertification: (data) => apiRequest('/users/me/certification', { method: 'POST', body: data }),
        myCertification: () => apiRequest('/users/me/certification'),

        follow: (userId) => apiRequest(`/users/${userId}/follow`, { method: 'POST' }),
        unfollow: (userId) => apiRequest(`/users/${userId}/follow`, { method: 'DELETE' }),
        followers: (userId) => apiRequest(`/users/${userId}/followers`),
        following: (userId) => apiRequest(`/users/${userId}/following`)
    },

    /* ---------------- 内容库 ---------------- */
    content: {
        categories: () => apiRequest('/content/categories'),

        heritage: (params) => apiRequest(`/content/heritage${qs(params)}`),
        heritageDetail: (id) => apiRequest(`/content/heritage/${id}`),
        regions: () => apiRequest('/content/heritage/regions'),

        inheritors: (params) => apiRequest(`/content/inheritors${qs(params)}`),
        inheritorDetail: (id) => apiRequest(`/content/inheritors/${id}`),

        materials: (params) => apiRequest(`/content/materials${qs(params)}`),
        createMaterial: (data) => apiRequest('/content/materials', { method: 'POST', body: data }),
        downloadMaterial: (id) => apiRequest(`/content/materials/${id}/download`, { method: 'POST' }),

        events: () => apiRequest('/content/events'),
        signupEvent: (eventId, data) => apiRequest(`/content/events/${eventId}/signup`, { method: 'POST', body: data }),
        mySignups: () => apiRequest('/content/my/signups'),

        news: (params) => apiRequest(`/content/news${qs(params)}`),
        achievements: () => apiRequest('/content/achievements')
    },

    /* ---------------- 共创协作（核心） ---------------- */
    projects: {
        meta: () => apiRequest('/projects/meta'),
        list: (params) => apiRequest(`/projects${qs(params)}`),
        detail: (id) => apiRequest(`/projects/${id}`),

        create: (data) => apiRequest('/projects', { method: 'POST', body: data }),
        update: (id, data) => apiRequest(`/projects/${id}`, { method: 'PUT', body: data }),
        changeStatus: (id, status, note) =>
            apiRequest(`/projects/${id}/status`, { method: 'PATCH', body: { status, note } }),

        apply: (id, role, reason) =>
            apiRequest(`/projects/${id}/apply`, { method: 'POST', body: { role, reason } }),
        members: (id) => apiRequest(`/projects/${id}/members`),
        reviewMember: (id, userId, decision, note) =>
            apiRequest(`/projects/${id}/members/${userId}`, { method: 'PATCH', body: { decision, note } }),
        changeMemberRole: (id, userId, role) =>
            apiRequest(`/projects/${id}/members/${userId}/role`, { method: 'PATCH', body: { role } }),
        removeMember: (id, userId) => apiRequest(`/projects/${id}/members/${userId}`, { method: 'DELETE' }),
        leave: (id) => apiRequest(`/projects/${id}/leave`, { method: 'POST' }),

        tasks: (id, params) => apiRequest(`/projects/${id}/tasks${qs(params)}`),
        createTask: (id, data) => apiRequest(`/projects/${id}/tasks`, { method: 'POST', body: data }),
        updateTask: (taskId, data) => apiRequest(`/projects/tasks/${taskId}`, { method: 'PATCH', body: data }),
        deleteTask: (taskId) => apiRequest(`/projects/tasks/${taskId}`, { method: 'DELETE' }),

        versions: (id) => apiRequest(`/projects/${id}/versions`),
        createVersion: (id, data) => apiRequest(`/projects/${id}/versions`, { method: 'POST', body: data }),
        markFinal: (id, versionId) =>
            apiRequest(`/projects/${id}/versions/${versionId}/final`, { method: 'POST' }),

        discussions: (id, params) => apiRequest(`/projects/${id}/discussions${qs(params)}`),
        createDiscussion: (id, data) => apiRequest(`/projects/${id}/discussions`, { method: 'POST', body: data }),

        myWorkspace: () => apiRequest('/projects/workspace/me'),
        myTasks: (params) => apiRequest(`/projects/tasks/me${qs(params)}`)
    },

    /* ---------------- 作品 ---------------- */
    works: {
        list: (params) => apiRequest(`/works${qs(params)}`),
        detail: (id) => apiRequest(`/works/${id}`),
        types: () => apiRequest('/works/types'),
        mine: (params) => apiRequest(`/works/mine${qs(params)}`),

        create: (data) => apiRequest('/works', { method: 'POST', body: data }),
        update: (id, data) => apiRequest(`/works/${id}`, { method: 'PUT', body: data }),
        setStatus: (id, status, note) => apiRequest(`/works/${id}/status`, { method: 'PATCH', body: { status, note } }),
        remove: (id) => apiRequest(`/works/${id}`, { method: 'DELETE' }),

        like: (id) => apiRequest(`/works/${id}/like`, { method: 'POST' }),
        unlike: (id) => apiRequest(`/works/${id}/like`, { method: 'DELETE' }),
        favorite: (id) => apiRequest(`/works/${id}/favorite`, { method: 'POST' }),
        unfavorite: (id) => apiRequest(`/works/${id}/favorite`, { method: 'DELETE' })
    },

    /* ---------------- 社区 ---------------- */
    community: {
        comments: (targetType, targetId, params) =>
            apiRequest(`/comments${qs({ targetType, targetId, ...params })}`),
        addComment: (data) => apiRequest('/comments', { method: 'POST', body: data }),
        deleteComment: (id) => apiRequest(`/comments/${id}`, { method: 'DELETE' }),

        toggle: (targetType, targetId, action) =>
            apiRequest('/interactions/toggle', { method: 'POST', body: { targetType, targetId, action } }),
        myInteractions: (targetType, action) =>
            apiRequest(`/interactions/mine${qs({ targetType, action })}`),

        topics: () => apiRequest('/topics'),
        topicWorks: (name, params) => apiRequest(`/topics/${name}/works${qs(params)}`)
    },

    /* ---------------- 通知 ---------------- */
    notifications: {
        list: (params) => apiRequest(`/notifications${qs(params)}`),
        unreadCount: () => apiRequest('/notifications/unread-count'),
        markRead: (id) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
        markAllRead: () => apiRequest('/notifications/read-all', { method: 'PATCH' })
    },

    /* ---------------- 管理后台 ---------------- */
    admin: {
        stats: () => apiRequest('/admin/stats'),
        trend: (days = 7) => apiRequest(`/admin/stats/trend${qs({ days })}`),

        works: (params) => apiRequest(`/admin/works${qs(params)}`),
        auditWork: (id, decision, note) =>
            apiRequest(`/admin/works/${id}/audit`, { method: 'PATCH', body: { decision, note } }),
        comments: (params) => apiRequest(`/admin/comments${qs(params)}`),
        hideComment: (id) => apiRequest(`/admin/comments/${id}/hide`, { method: 'PATCH' }),
        offlineProject: (id) => apiRequest(`/admin/projects/${id}/offline`, { method: 'PATCH' }),

        users: (params) => apiRequest(`/admin/users${qs(params)}`),
        setUserStatus: (id, status) => apiRequest(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } }),
        setUserRole: (id, role) => apiRequest(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } }),

        certifications: (params) => apiRequest(`/admin/certifications${qs(params)}`),
        reviewCertification: (id, decision, note) =>
            apiRequest(`/admin/certifications/${id}`, { method: 'PATCH', body: { decision, note } }),

        auditLogs: (limit = 50) => apiRequest(`/admin/audit-logs${qs({ limit })}`)
    },

    /* ---------------- AI ---------------- */
    ai: {
        status: () => apiRequest('/ai/status'),
        chat: (message, heritageId) => apiRequest('/ai/chat', { method: 'POST', body: { message, heritageId } }),
        workDesc: (data) => apiRequest('/ai/work-desc', { method: 'POST', body: data }),
        patternIdea: (data) => apiRequest('/ai/pattern-idea', { method: 'POST', body: data }),
        searchEnhance: (query) => apiRequest('/ai/search-enhance', { method: 'POST', body: { query } }),
        recommend: (limit = 6) => apiRequest(`/ai/recommend${qs({ limit })}`)
    },

    /* ---------------- 上传 ---------------- */
    upload: {
        /** 传入 File 对象，内部转 base64 后上传，返回 { url, size, mime } */
        file: (file) =>
            new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                    apiRequest('/upload', { method: 'POST', body: { dataUrl: reader.result, filename: file.name } })
                        .then(resolve)
                        .catch(reject);
                reader.onerror = () => reject(new Error('读取文件失败'));
                reader.readAsDataURL(file);
            })
    }
};

/* ---------------- 兼容旧代码的辅助函数 ---------------- */
window.getToken = getToken;
window.setToken = setToken;
window.clearToken = clearToken;
window.apiRequest = apiRequest;
window.API_BASE_URL = API_BASE_URL;
window.API_ORIGIN = API_ORIGIN;
window.APIOnline = window.APIOnline !== false;

/**
 * 后端是否可用（页面底部/控制台自检用）
 * @param {number} retries 重试次数
 */
window.checkBackend = async function (retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const r = await fetch(API_ORIGIN + '/health', { cache: 'no-store' });
            if (r.ok) { window.APIOnline = true; return true; }
        } catch (e) { /* 下一轮再试 */ }
        if (i < retries) await sleep(350 * (i + 1));
    }
    window.APIOnline = false;
    return false;
};

/**
 * 等待后端可用（页面打开时后端可能还在启动中），最多等 timeoutMs
 * 可用后会派发 window 事件 'api-ready'，页面可据此自动刷新数据。
 */
window.ensureBackend = async function (timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    let wait = 400;
    while (Date.now() < deadline) {
        if (await window.checkBackend(0)) {
            try { window.dispatchEvent(new CustomEvent('api-ready')); } catch (e) { /* ignore */ }
            return true;
        }
        await sleep(wait);
        wait = Math.min(wait * 1.6, 1500);
    }
    return false;
};

