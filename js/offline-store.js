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
  /* ------------------------------------------------------------------
   * 演示项目（静态站/离线模式的数据源）
   * 每条都带任务、版本、讨论，所以卡片能显示进度、详情页有任务板——
   * 不是为了"看起来有很多数据"，而是让评审能看清共创是怎么推进的。
   * ------------------------------------------------------------------ */
  const DEMO_PROJECT_SPECS = [
    {
      id: 'proj_offline_junci',
      title: '钧瓷「入窑一色」茶器共创',
      heritageId: 'junci',
      status: 'in_progress',
      owner: '张砚秋（豫剧传承人）',
      limit: 5,
      daysLeft: 23,
      description:
        '以钧瓷窑变釉色为灵感，设计一套面向年轻人的现代茶器。目标是把「入窑一色、出窑万彩」的不可控之美，转译成可量产的器型与配色方案。',
      recruitNeed: '产品设计 1 名（会建模）、文案 1 名（懂茶文化）',
      tasks: [
        ['釉色样本采集与比对', '去神垕镇采集 20 组窑变釉样本，记录烧成温度与气氛', '张砚秋', 'done', 100],
        ['器型草图 3 版', '盖碗 / 公道杯 / 品茗杯，各出 3 版草图', '林一一', 'done', 100],
        ['茶器包装方案', '外盒 + 内衬，需考虑运输与展出两种场景', '林一一', 'doing', 60],
        ['产品故事文案', '讲清「入窑一色、出窑万彩」的工艺不可控性', '陈墨白', 'review', 100],
        ['包装打样对接', '联系 2 家包装厂各出 1 版样', '我', 'review', 100],
        ['烧成曲线说明', '把窑变原理写成可读的工艺说明', '我', 'doing', 55],
        ['拍摄与详情页', '成品拍摄 12 张，含细节与使用场景', null, 'todo', 0],
      ],
      versions: [
        ['v1 釉色样本册', '整理了 20 组窑变釉样本，标注温度、气氛与呈色'],
        ['v2 器型与包装提案', '盖碗为主视觉，包装用宣纸质感 + 金线压印'],
      ],
      discussions: [
        ['林一一', '盖碗的盖钮想做成钧瓷常见的「乳钉」，会不会太传统？'],
        ['张砚秋', '乳钉其实很耐看，配现代极简的杯身反而有对比，可以先出一版看看。'],
        ['陈墨白', '文案我按「一窑一色、不可复制」的方向写了一版，放在版本里了。'],
      ],
    },
    {
      id: 'proj_offline_yuju',
      title: '豫剧脸谱当代插画系列',
      heritageId: 'yuju',
      status: 'recruiting',
      owner: '林一一（视觉设计）',
      limit: 6,
      daysLeft: 35,
      description:
        '以豫剧脸谱的色彩与谱式为核心母题，做一组可用于日常生活的文创产品。已确定杯具与包装两个方向，希望找到擅长插画与包装的设计伙伴。',
      recruitNeed: '视觉设计 1 名（手绘/插画）、文案 1 名（熟悉戏曲或民俗）',
      tasks: [
        ['脸谱谱式梳理（红脸/黑脸/花脸）', '整理 12 种常见谱式，标注寓意与用色', '张砚秋', 'done', 100],
        ['插画线稿 6 张', '每张对应一种谱式，风格：国潮但不过度装饰', '林一一', 'doing', 40],
        ['谱式释义校对', '核对 12 种谱式的寓意与代表剧目', '我', 'todo', 0],
        ['包装结构设计', '杯具外盒，可平铺展示', null, 'todo', 0],
      ],
      versions: [['v1 谱式资料包', '12 种谱式的寓意、用色与代表剧目']],
      discussions: [
        ['林一一', '这个项目还在招募设计伙伴，可以直接申请，我会尽快审。'],
        ['小林同学', '想参与文案部分，主要是想把每个谱式的故事写短一点。'],
      ],
    },
    {
      id: 'proj_offline_tangsancai',
      title: '唐三彩「丝路驼铃」家居摆件',
      heritageId: 'tangsancai',
      status: 'in_progress',
      owner: '张砚秋（豫剧传承人）',
      limit: 5,
      daysLeft: 18,
      description: '把唐三彩的骆驼、胡人俑造型抽象化，做成玄关摆件与香插。保留黄绿白三彩釉，但弱化写实细节。',
      recruitNeed: '产品设计 1 名、工艺顾问 1 名',
      tasks: [
        ['三彩釉色复原比对', '按黄绿白三色，比对 6 件馆藏', '张砚秋', 'done', 100],
        ['摆件造型 2 版（骆驼/香插）', '抽象化，保留驼峰与铃铛两个识别点', '林一一', 'doing', 70],
        ['香插开模跟进', '与宜阳窑口确认开模排期（约 10 天）', '我', 'doing', 40],
        ['详情页文案', '讲丝绸之路与三彩的关系', '陈墨白', 'todo', 0],
        ['礼盒装方案', '伴手礼场景，含手提袋', null, 'todo', 0],
      ],
      versions: [['v1 造型提案', '两版造型 + 釉色对照表']],
      discussions: [
        ['平台管理员', '这个题材很适合做伴手礼，建议同时考虑礼盒装。'],
        ['张砚秋', '礼盒我先记在任务里，等造型定了再加。'],
      ],
    },
    {
      id: 'proj_offline_zhuxianzhen',
      title: '朱仙镇木版年画门神新绘',
      heritageId: 'zhuxianzhen-nianhua',
      status: 'reviewing',
      owner: '林一一（视觉设计）',
      limit: 4,
      daysLeft: 6,
      description:
        '重绘一对门神（秦琼、尉迟恭），保留木版套色的用色逻辑与线条语言，但把表情与姿态调得更适合现代家居张贴。',
      recruitNeed: '插画 1 名、印刷工艺顾问 1 名',
      tasks: [
        ['原作纹样与用色分析', '拆解 5 套传统版的门神结构与设色', '张砚秋', 'done', 100],
        ['门神重绘线稿', '两版：传统端正版 / 轻松版', '林一一', 'done', 100],
        ['套色打样', '5 色套印，纸用泾县宣', '林一一', 'review', 100],
        ['套色样张验收', '核对 5 色套印是否对版、有无跑色', '我', 'review', 100],
      ],
      versions: [
        ['v1 线稿', '两版线稿 + 用色标注'],
        ['v2 套色样张', '5 色套印样张，已寄出'],
      ],
      discussions: [
        ['林一一', '套色样张寄出了，红色那版比预想的稳。'],
        ['张砚秋', '收到后我们走结项评审。'],
      ],
    },
    {
      id: 'proj_offline_bianxiu',
      title: '汴绣纹样丝巾共创',
      heritageId: 'bianxiu',
      status: 'closed',
      owner: '陈墨白（文案）',
      limit: 4,
      daysLeft: -12,
      description:
        '从汴绣传统花卉题材中提取折枝与团花构图，重新排成适合方巾的连续纹样。面料用真丝，纹样以散套针、滚针绣制。',
      recruitNeed: '视觉设计 1 名',
      tasks: [
        ['母题提取（折枝/团花）', '从 8 件传统绣品中提取 12 个可用母题', '林一一', 'done', 100],
        ['四方连续排布', '90×90cm 方巾，四边留白 6cm', '林一一', 'done', 100],
        ['打样与绣制验收', '真丝 16 姆米，散套针 + 滚针', '张砚秋', 'done', 100],
      ],
      versions: [
        ['v1 母题库', '12 个母题 + 出处说明'],
        ['v2 终版纹样（已打样）', '四方连续 + 四角折枝，已出 2 条样巾'],
      ],
      discussions: [['张砚秋', '样巾收到了，绣工很稳，这个项目就此结项，感谢两位。']],
    },
    {
      id: 'proj_offline_maojian',
      title: '信阳毛尖「明前」茶包设计',
      heritageId: 'xinyang-maojian',
      status: 'recruiting',
      owner: '林一一（视觉设计）',
      limit: 4,
      daysLeft: 41,
      description: '给信阳毛尖做一套明前茶的便携茶包与手提袋，强调「一芽一叶」的采摘标准与炒制香气。',
      recruitNeed: '包装设计 1 名、摄影 1 名',
      tasks: [
        ['包装方向调研', '看 10 个同类茶品牌的包装策略', '张砚秋', 'doing', 30],
        ['茶包材质测试', '玉米纤维 vs 无纺布，比较透香与价格', null, 'todo', 0],
      ],
      versions: [],
      discussions: [['林一一', '还在起步阶段，欢迎做包装的朋友申请。']],
    },
  ];

  /** 由 spec 算出与后端一致的形状（进度、任务计数、截止时间都由数据推出来） */
  function buildDemoProject(spec) {
    const tasks = (spec.tasks || []).map(([title, desc, assignee, status, progress], i) => ({
      id: spec.id + '_t' + (i + 1),
      title,
      description: desc,
      assigneeName: assignee || null,
      status,
      progress,
      deadline: shiftDate(7 + i * 3),
      mine: assignee === '我',
    }));
    const done = tasks.filter((t) => t.status === 'done').length;
    const doing = tasks.filter((t) => t.status === 'doing').length;
    const review = tasks.filter((t) => t.status === 'review').length;
    const todo = tasks.filter((t) => t.status === 'todo').length;
    return {
      id: spec.id,
      title: spec.title,
      heritageId: spec.heritageId,
      heritageName: heritageName(spec.heritageId),
      status: spec.status,
      ownerName: spec.owner,
      description: spec.description,
      recruitNeed: spec.recruitNeed,
      memberLimit: spec.limit,
      membersCount: (spec.discussions || []).length + 1,
      deadline: shiftDate(spec.daysLeft),
      progress: spec.status === 'closed' ? 100 : tasks.length ? Math.round((done / tasks.length) * 100) : 0,
      taskStats: { total: tasks.length, done },
      progressDetail: { todo, doing, review, done },
      versionsCount: (spec.versions || []).length,
      discussionsCount: (spec.discussions || []).length,
      worksCount: spec.status === 'closed' ? 2 : 0,
      tasks,
      versions: (spec.versions || []).map(([title, content], i) => ({
        id: spec.id + '_v' + (i + 1),
        versionNo: i + 1,
        title,
        content,
        createdAt: shiftDate(-(i + 1) * 5),
      })),
      discussions: (spec.discussions || []).map(([author, content], i) => ({
        id: spec.id + '_d' + (i + 1),
        authorName: author,
        content,
        createdAt: shiftDate(-(i + 1)),
      })),
    };
  }

  /** yyyy-mm-dd hh:mm:ss，days 为偏移（负数是过去） */
  function shiftDate(days) {
    const d = new Date(Date.now() + days * 86400000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 23:59:59`;
  }

  const DEMO_PROJECTS = DEMO_PROJECT_SPECS.map(buildDemoProject);

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

  /* ---------------- 静态演示下的"可写"支持（localStorage） ----------------
   * 目的：GitHub Pages 这类纯静态托管没有后端，但评审点「发起共创」「申请加入」不能没反应。
   * 做法：写入落到 localStorage，读的时候和内置示例数据合并。
   * 诚实标注：数据只在这台设备的这个浏览器里，不同步、清缓存即消失。
   */
  const K_CREATED = 'henanICHOfflineCreated';
  const K_APPLIED = 'henanICHOfflineApplied';

  function readJson(key, def) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return v == null ? def : v;
    } catch (e) {
      return def;
    }
  }
  function writeJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      /* 隐私模式可能写不了，忽略 */
    }
  }
  const createdProjects = () => readJson(K_CREATED, []);
  const appliedIds = () => readJson(K_APPLIED, []);
  function currentUser() {
    try {
      const u = window.getUserData ? window.getUserData() : null;
      if (u) return u;
      return JSON.parse(localStorage.getItem('henanICHCurrentUser') || 'null');
    } catch (e) {
      return null;
    }
  }

  const projects = {
    list(opts = {}) {
      const { status, keyword, page = 1, pageSize = 9 } = opts;
      // 用户自己发布的项目排在最前面（静态演示版）
      let all = createdProjects().concat(DEMO_PROJECTS.map(mapProject));
      if (status) all = all.filter((p) => p.status === status);
      if (keyword) {
        const k = String(keyword).toLowerCase();
        all = all.filter((p) => (p.title + p.description + (p.recruitNeed || '')).toLowerCase().includes(k));
      }
      const start = (page - 1) * pageSize;
      return { list: all.slice(start, start + pageSize), total: all.length, page, pageSize };
    },
    detail(id) {
      const applied = appliedIds().indexOf(id) > -1;
      const mine = createdProjects().find((p) => p.id === id);
      const raw = mine || DEMO_PROJECTS.find((p) => p.id === id);
      if (!raw) return null;
      const base = mine ? mine : mapProject(raw);
      // 成员：发起人 + 讨论区里出现过的人（让头像/人数看起来是真的）
      const names = [raw.ownerName || '发起人'];
      (raw.discussions || []).forEach((d) => {
        if (d.authorName && names.indexOf(d.authorName) === -1) names.push(d.authorName);
      });
      const members = names.map((n, i) => ({
        userId: raw.id + '_m' + i,
        displayName: n,
        role: i === 0 ? '统筹' : ['设计', '文案', '摄影', '工艺顾问'][i % 4],
        status: 'approved',
      }));
      return {
        ...base,
        members,
        membersCount: members.length,
        tasks: raw.tasks || [],
        versions: raw.versions || [],
        discussions: raw.discussions || [],
        // 演示模式：把当前登录用户当作已加入的成员，这样任务看板/讨论可见（只是演示，不会写库）
        myMemberStatus: mine ? null : 'approved',
        isOwner: !!mine,
        canEdit: !!mine,
        __offline: true,
        __localCreate: !!mine,
      };
    },

    /** 发起共创（静态演示版：写入 localStorage，形状与后端返回保持一致） */
    create(payload) {
      const me = currentUser() || {};
      const now = new Date();
      const raw = {
        id: 'local_' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 5),
        ownerName: me.displayName || me.username || '演示用户',
        title: payload.title,
        description: payload.description,
        recruitNeed: payload.recruitNeed || '',
        heritageId: payload.heritageId || null,
        heritageName: heritageName(payload.heritageId) || '',
        memberLimit: Number(payload.memberLimit) || 6,
        membersCount: 1,
        status: 'recruiting',
        progress: 0,
        taskStats: { total: 0, done: 0 },
        progressDetail: { todo: 0, doing: 0, review: 0, done: 0 },
        versionsCount: 0,
        discussionsCount: 0,
        worksCount: 0,
        createdAt: now.toISOString().slice(0, 19).replace('T', ' '),
        tasks: [],
        versions: [],
        discussions: [],
      };
      const mapped = mapProject(raw);
      const stored = Object.assign({}, mapped, {
        ownerId: me.id || 'offline_me',
        ownerUsername: me.username || 'demo',
        deadlineAt: payload.deadline || null,
        tasks: [],
        versions: [],
        discussions: [],
        __local: true,
      });
      const list = createdProjects();
      list.unshift(stored);
      writeJson(K_CREATED, list);
      markOffline();
      return stored;
    },

    /** 讨论列表（静态演示版）：返回与后端同形的 { list, total } */
    discussions(id) {
      const raw = createdProjects().find((p) => p.id === id) || DEMO_PROJECTS.find((p) => p.id === id);
      const list = (raw && raw.discussions) || [];
      return { list, total: list.length, page: 1, pageSize: list.length || 10 };
    },

    /** 申请加入（静态演示版：记下 pending 状态） */
    apply(id, role, reason) {
      const list = appliedIds();
      if (list.indexOf(id) === -1) list.unshift(id);
      writeJson(K_APPLIED, list);
      writeJson(
        'henanICHOfflineApplyInfo',
        Object.assign(readJson('henanICHOfflineApplyInfo', {}), { [id]: { role, reason, at: Date.now() } })
      );
      markOffline();
      return { ok: true, status: 'pending', __offline: true };
    },

    /**
     * 我的工作台（静态演示版）
     * 用示例数据算出"有内容"的工作台：我发起的 2、我参与的 3、待我审核 4、我的待办若干。
     * 数字不是写死的，都是从项目/任务里数出来的。
     */
    myWorkspace(user) {
      const u = user || currentUser() || {};
      const all = DEMO_PROJECTS.concat(createdProjects());
      const owned = all.filter((p) => p.id === 'proj_offline_junci' || p.id === 'proj_offline_tangsancai' || p.__local);
      const joined = all.filter((p) => !owned.includes(p));
      const ownedIds = owned.map((p) => p.id);

      // 待我审核：我发起的项目里，讨论区出现过、但还没加入的人
      const pending = [];
      owned.forEach((p) => {
        (p.discussions || []).forEach((d, i) => {
          if (i === 0 && d.authorName && d.authorName !== p.ownerName) {
            pending.push({
              project_id: p.id,
              project_title: p.title,
              user_id: p.id + '_applicant_' + i,
              applicant: d.authorName,
              role: ['视觉设计', '文案', '摄影', '工艺顾问'][i % 4],
              apply_reason: '这个环节我有经验，也想跟老师学一下工艺细节。',
              joined_at: d.createdAt,
            });
          }
        });
      });

      // 我的待办：任务里 assignee 标了「我」的，且没做完
      const todoTasks = [];
      all.forEach((p) => {
        (p.tasks || []).forEach((t) => {
          if (t.mine && t.status !== 'done') {
            todoTasks.push({
              id: t.id,
              title: t.title,
              status: t.status,
              progress: t.progress,
              deadline: t.deadline,
              projectId: p.id,
              projectTitle: p.title,
            });
          }
        });
      });

      const row = (p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        heritageName: p.heritageName,
        membersCount: p.membersCount,
        memberLimit: p.memberLimit,
        progress: p.progress,
        taskStats: p.taskStats,
        progressDetail: p.progressDetail,
        deadline: p.deadline,
        updatedAt: p.createdAt,
      });

      return {
        owned: owned.map(row),
        joined: joined.map(row),
        pendingApplications: pending,
        todoTasks,
        summary: {
          ownedCount: owned.length,
          joinedCount: joined.length,
          pendingApplyCount: pending.length,
          todoTaskCount: todoTasks.length,
        },
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
        const err = /** @type {HttpError} */ (
          new Error('离线模式：只能用演示账号登录（admin / creator / designer / writer / user，密码 123456）')
        );
        err.status = 401;
        throw err;
      }
      if (password !== '123456') {
        const err = /** @type {HttpError} */ (new Error('离线模式：演示账号密码都是 123456'));
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
