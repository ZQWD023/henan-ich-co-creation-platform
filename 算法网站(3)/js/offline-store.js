/* offline-store.js —— 离线数据层
 *
 * 目的：让"直接双击 index.html（file://）打开网站"也能完整使用。
 *
 * 浏览器出于安全限制，网页无法启动本地进程，所以后端没运行时，
 * 共创广场 / 共创项目 / 我的工作台 / 活动资讯 这些"需要接口"的页面会拿不到数据。
 *
 * 这里提供一份与后端结构完全一致的本地数据源（复用 js/data.js 的静态数据 + 演示项目），
 * 页面在接口失败时自动切到它，用户看到的仍然是完整页面，而不是"加载失败"。
 *
 * 使用方式（页面里）：
 *   const data = await OfflineStore.call(
 *     () => window.API.projects.list(params),
 *     () => OfflineStore.projects.list(params)
 *   );
 */
(function () {
  'use strict';

  /* ---------------- 演示共创项目（与后端 demo 数据保持一致） ---------------- */
  const DEMO_PROJECTS = [
    {
      id: 'proj_offline_yuju',
      title: '豫剧脸谱当代文创系列（招募中）',
      status: 'recruiting',
      heritageId: 'yuju',
      heritageName: '豫剧',
      description:
        '以豫剧脸谱的色彩与谱式为核心母题，做一组可用于日常生活的文创产品。已确定做杯具与包装两个方向，希望找到擅长插画与包装的设计伙伴，以及能把非遗故事讲清楚的文案。',
      recruitNeed: '视觉设计 1 名（会手绘或插画）、文案 1 名（熟悉戏曲或民俗）',
      memberLimit: 6,
      membersCount: 1,
      progress: 0,
      taskStats: { total: 0, done: 0 },
      ownerName: '豫剧传承人·张老师',
      createdAt: '2026-03-01 10:00:00',
    },
    {
      id: 'proj_offline_junci',
      title: '钧瓷「入窑一色」茶器共创（协作中）',
      status: 'in_progress',
      heritageId: 'junci',
      heritageName: '钧瓷烧制技艺',
      description:
        '以钧瓷窑变釉色为灵感，设计一套面向年轻人的现代茶器。目标是把「入窑一色、出窑万彩」的不可控之美，转译成可量产的器型与配色方案。',
      recruitNeed: '产品设计 1 名、文案 1 名',
      memberLimit: 5,
      membersCount: 3,
      progress: 33,
      taskStats: { total: 3, done: 1 },
      ownerName: '豫剧传承人·张老师',
      createdAt: '2026-02-18 10:00:00',
    },
    {
      id: 'proj_offline_bianxiu',
      title: '汴绣纹样丝巾共创（已结项）',
      status: 'closed',
      heritageId: 'bianxiu',
      heritageName: '汴绣',
      description:
        '从汴绣传统花卉题材中提取折枝与团花构图，重新排成适合方巾的连续纹样。面料用真丝，纹样以散套针、滚针绣制。',
      recruitNeed: '视觉设计 1 名',
      memberLimit: 4,
      membersCount: 2,
      progress: 100,
      taskStats: { total: 1, done: 1 },
      ownerName: '豫剧传承人·张老师',
      createdAt: '2026-01-20 10:00:00',
    },
  ];

  const STATUS_TEXT = {
    draft: '草稿',
    recruiting: '招募中',
    in_progress: '协作中',
    reviewing: '结项评审',
    closed: '已结项',
    cancelled: '已取消',
  };
  const NEXT_STATUS = {
    recruiting: ['in_progress', 'cancelled'],
    in_progress: ['reviewing', 'cancelled'],
    reviewing: ['closed'],
    closed: [],
    cancelled: [],
  };

  /* ---------------- 工具 ---------------- */
  function markOffline() {
    if (window.__offlineMode) return;
    window.__offlineMode = true;
    // 已经用内置数据把页面渲染出来了，底部"后端没启动"的横幅就没必要再挂着
    if (window.__backendGuard && typeof window.__backendGuard.hide === 'function') {
      window.__backendGuard.hide();
    }
    try {
      window.dispatchEvent(new CustomEvent('offline-mode'));
    } catch (e) {
      /* ignore */
    }
  }

  function isNetworkError(err) {
    return !err || err.network || !err.status;
  }

  function heritageName(id) {
    const p = window.ICH && ICH.getProject ? ICH.getProject(id) : null;
    return p ? p.name : '';
  }

  /** data.js 的静态数据：优先取 ICH（已挂到 window），再退回同名全局 */
  function localWorks() {
    return (window.ICH && ICH.works) || window.coCreateWorks || [];
  }
  function localEvents() {
    return (window.ICH && ICH.events) || window.events || [];
  }
  function localNews() {
    return (window.ICH && ICH.news) || window.news || [];
  }

  function authorOf(u) {
    return u || { id: 'offline', username: 'offline', displayName: '离线演示', avatar: null };
  }

  /* ---------------- 作品 ---------------- */
  const localLikes = (() => {
    try {
      return JSON.parse(localStorage.getItem('ichOfflineLikes') || '{}');
    } catch (e) {
      return {};
    }
  })();
  function saveLikes() {
    try {
      localStorage.setItem('ichOfflineLikes', JSON.stringify(localLikes));
    } catch (e) {
      /* ignore */
    }
  }

  function mapWork(w, i) {
    const liked = !!localLikes[w.id];
    return {
      id: w.id,
      title: w.title,
      workType: w.category,
      summary: w.desc,
      content: w.desc,
      coverUrl: null,
      fileUrl: null,
      tags: w.tags || [],
      status: 'approved',
      auditNote: null,
      viewsCount: Math.round((w.likes || 0) * 1.15),
      likesCount: (w.likes || 0) + (liked ? 1 : 0),
      favoritesCount: Math.round((w.votes || 0) / 3),
      commentsCount: 0,
      heritageId: w.projectId,
      heritageName: heritageName(w.projectId),
      projectId: null,
      projectTitle: null,
      author: { id: 'offline_' + i, username: 'offline', displayName: w.author, avatar: null },
      createdAt: (w.date || '2026-01-01') + ' 10:00:00',
      updatedAt: (w.date || '2026-01-01') + ' 10:00:00',
      liked,
      favorited: false,
      __offline: true,
    };
  }

  const works = {
    list({ page = 1, pageSize = 9 } = {}) {
      const all = localWorks().map(mapWork);
      const start = (page - 1) * pageSize;
      return { list: all.slice(start, start + pageSize), total: all.length, page, pageSize };
    },
    like(id) {
      localLikes[id] = true;
      saveLikes();
      const w = localWorks().find((x) => x.id === id);
      return { liked: true, likesCount: (w ? w.likes : 0) + 1, __offline: true };
    },
    unlike(id) {
      delete localLikes[id];
      saveLikes();
      const w = localWorks().find((x) => x.id === id);
      return { liked: false, likesCount: w ? w.likes : 0, __offline: true };
    },
    mine() {
      return { list: [], total: 0, page: 1, pageSize: 20, __offline: true };
    },
  };

  /* ---------------- 共创项目 ---------------- */
  function mapProject(p) {
    const status = p.status;
    return {
      id: p.id,
      title: p.title,
      coverUrl: null,
      description: p.description,
      recruitNeed: p.recruitNeed,
      memberLimit: p.memberLimit,
      membersCount: p.membersCount,
      deadline: null,
      status,
      statusText: STATUS_TEXT[status] || status,
      nextStatuses: (NEXT_STATUS[status] || []).map((s) => ({ status: s, text: STATUS_TEXT[s] })),
      viewsCount: 12,
      isFeatured: false,
      heritageId: p.heritageId,
      heritageName: p.heritageName,
      owner: authorOf({ id: 'offline_owner', username: 'creator', displayName: p.ownerName, avatar: null }),
      progress: p.progress,
      taskStats: p.taskStats,
      progressDetail: {
        todo: Math.max(0, p.taskStats.total - p.taskStats.done),
        doing: 0,
        review: 0,
        done: p.taskStats.done,
      },
      createdAt: p.createdAt,
      updatedAt: p.createdAt,
      closedAt: status === 'closed' ? p.createdAt : null,
      __offline: true,
    };
  }

  const projects = {
    list({ status, keyword, page = 1, pageSize = 9 } = {}) {
      let all = DEMO_PROJECTS.map(mapProject);
      if (status) all = all.filter((p) => p.status === status);
      if (keyword) {
        const k = String(keyword).toLowerCase();
        all = all.filter((p) => (p.title + p.description + (p.recruitNeed || '')).toLowerCase().includes(k));
      }
      const start = (page - 1) * pageSize;
      return { list: all.slice(start, start + pageSize), total: all.length, page, pageSize };
    },
    detail(id) {
      const raw = DEMO_PROJECTS.find((p) => p.id === id);
      if (!raw) return null;
      const base = mapProject(raw);
      return {
        ...base,
        members: [{ userId: 'offline_owner', displayName: raw.ownerName, role: '发起人', status: 'approved' }],
        tasks: [],
        versions: [],
        discussions: [],
        myMemberStatus: null,
        isOwner: false,
        canEdit: false,
        __offline: true,
      };
    },
    myWorkspace(user) {
      const u = user || {};
      return {
        owned: [],
        joined: [],
        pendingApplications: [],
        todoTasks: [],
        summary: { ownedCount: 0, joinedCount: 0, pendingApplyCount: 0, todoTaskCount: 0 },
        __offline: true,
        __user: u.displayName || u.username || '',
      };
    },
  };

  /* ---------------- 活动 / 资讯 ---------------- */
  const content = {
    events() {
      return localEvents().map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        date: e.date,
        location: e.location,
        status: e.status,
        desc: e.desc,
        icon: e.icon,
        signupCount: 0,
        signed: false,
        __offline: true,
      }));
    },
    news() {
      return localNews().map((n) => ({
        id: n.id,
        title: n.title,
        date: n.date,
        news_date: n.date,
        source: n.source,
        category: n.category,
        summary: n.summary,
        __offline: true,
      }));
    },
  };

  /* ---------------- 离线登录（演示账号） ---------------- */
  const DEMO_ACCOUNTS = [
    { username: 'admin', displayName: '平台管理员', role: 'admin', certStatus: 'approved' },
    { username: 'creator', displayName: '豫剧传承人·张老师', role: 'creator', certStatus: 'approved' },
    { username: 'designer', displayName: '林一设计', role: 'creator', certStatus: 'approved' },
    { username: 'writer', displayName: '陈默文案', role: 'creator', certStatus: 'approved' },
    { username: 'user', displayName: '小林同学', role: 'user', certStatus: 'none' },
  ];

  const auth = {
    login(username, password) {
      const acc = DEMO_ACCOUNTS.find((a) => a.username === username);
      // 也允许用之前注册过的本地账号（离线时只校验是否登录过）
      let localUsers = [];
      try {
        localUsers = JSON.parse(localStorage.getItem('henanICHUsers') || '[]');
      } catch (e) {
        localUsers = [];
      }
      const localHit = Array.isArray(localUsers) ? localUsers.find((u) => u.username === username) : null;

      if (!acc && !localHit) {
        const err = new Error(
          '离线模式：只能用演示账号登录（admin / creator / designer / writer / user，密码 123456）'
        );
        err.status = 401;
        throw err;
      }
      if (password !== '123456') {
        const err = new Error('离线模式：演示账号密码都是 123456');
        err.status = 401;
        throw err;
      }
      markOffline();
      const user = acc
        ? {
            id: 'offline_' + acc.username,
            username: acc.username,
            displayName: acc.displayName,
            role: acc.role,
            certStatus: acc.certStatus,
            avatar: null,
            favorites: [],
            likes: [],
          }
        : localHit;
      return { token: 'offline-token-' + Date.now(), user, __offline: true };
    },
  };

  /* ---------------- 统一入口 ---------------- */
  /**
   * 页面一加载就探活一次 /health：
   *   通了 → 后续全走真实接口；
   *   不通 → 直接切本地数据（不再等接口重试的 2 秒，页面秒开）。
   */
  let apiState = 'unknown'; // unknown | up | down
  const probePromise = (async function probe() {
    const origin = window.API_ORIGIN || (window.API_BASE_URL || '').replace(/\/api\/?$/, '') || location.origin;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    try {
      const r = await fetch(origin + '/health', { cache: 'no-store', signal: controller.signal });
      apiState = r.ok ? 'up' : 'down';
    } catch (e) {
      apiState = 'down';
    } finally {
      clearTimeout(timer);
    }
    return apiState;
  })();

  /**
   * 先走真实接口；只在"网络层失败/后端没起"时切到本地数据。
   * HTTP 业务错误（400/401/500 等）照旧抛给页面处理。
   */
  async function call(apiFn, fallbackFn) {
    const state = apiState === 'unknown' ? await probePromise : apiState;

    if (state === 'up') {
      try {
        return await apiFn();
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        apiState = 'down'; // 服务中途挂了，本次也走兜底
      }
    }

    if (typeof fallbackFn !== 'function') throw new Error('服务不可用');
    markOffline();
    const data = await fallbackFn();
    if (data === null || data === undefined) throw new Error('服务不可用');
    return data;
  }

  window.OfflineStore = {
    call,
    probePromise,
    isOffline: () => !!window.__offlineMode,
    apiState: () => apiState,
    markOffline,
    works,
    projects,
    content,
    auth,
    DEMO_PROJECTS,
    STATUS_TEXT,
  };
})();
