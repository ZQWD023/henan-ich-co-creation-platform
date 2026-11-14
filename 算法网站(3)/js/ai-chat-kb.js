/* ai-chat-kb.js —— AI 问答的"离线知识库"
 *
 * 作用：当后端暂时访问不到（还没启动、网络断开、接口超时）时，
 *       直接用页面自带的数据（js/data.js）回答用户问题，
 *       保证 AI 问答页任何时候都有内容可答，不会出现"服务未启动"的尴尬提示。
 *
 * 检索思路与后端 services/knowledge.service.js 一致：
 *   项目名 > 标签 > 分类 > 地区 > 简介碎片，命中后组织成一段可读的回答。
 */
(function () {
    'use strict';

    // 口语词 → 十大分类
    var CATEGORY_HINTS = [
        { keys: ['戏曲', '唱戏', '剧种', '戏剧', '梆子', '唱腔', '戏台'], cat: '传统戏剧' },
        { keys: ['武术', '功夫', '拳法', '太极', '杂技', '游艺', '体育'], cat: '传统体育·游艺与杂技' },
        { keys: ['音乐', '乐器', '唢呐', '民歌', '曲牌', '吹打'], cat: '传统音乐' },
        { keys: ['舞蹈', '傩舞'], cat: '传统舞蹈' },
        { keys: ['曲艺', '说唱', '大鼓', '坠子', '评书', '三弦'], cat: '曲艺' },
        { keys: ['美术', '年画', '剪纸', '刺绣', '雕塑', '泥塑', '绘画'], cat: '传统美术' },
        { keys: ['技艺', '烧造', '瓷器', '陶瓷', '酿造', '手工', '工艺'], cat: '传统技艺' },
        { keys: ['医药', '中医', '正骨', '药材'], cat: '传统医药' },
        { keys: ['民俗', '庙会', '祭祀', '节令', '书会', '祭典'], cat: '民俗' },
        { keys: ['传说', '神话', '故事', '文学', '歌谣'], cat: '民间文学' }
    ];

    var STOP = ['什么', '怎么', '哪些', '哪个', '如何', '为什么', '有没有', '可以', '介绍', '一下', '请问', '河南', '非遗', '非物质', '文化遗产', '区别', '特点'];

    function projects() {
        return (window.heritageProjects || (window.ICH && window.ICH.projects) || []);
    }
    function categories() {
        return (window.ichCategories || (window.ICH && window.ICH.categories) || []);
    }
    function categoryName(id) {
        var c = categories().filter(function (x) { return x.id === id; })[0];
        return c ? c.name : '';
    }

    /** 从问题里切出 2~4 字关键词 */
    function keywords(question) {
        var q = String(question || '').replace(/[\s，。！？、,.!?：:；;"'（）()《》]+/g, ' ').trim();
        var out = {};
        q.split(' ').filter(Boolean).forEach(function (chunk) {
            if (chunk.length <= 4) out[chunk] = 1;
            for (var n = 2; n <= Math.min(4, chunk.length); n++) {
                for (var i = 0; i + n <= chunk.length; i++) out[chunk.slice(i, i + n)] = 1;
            }
        });
        STOP.forEach(function (s) { delete out[s]; });
        return Object.keys(out).filter(function (k) { return k.length >= 2; });
    }

    function cityOf(region) {
        return String(region || '').split(/[·・]/)[0].replace(/市$/, '');
    }

    function scoreAll(question) {
        var q = String(question || '');
        var kws = keywords(question);
        var list = projects().map(function (p) {
            var catName = categoryName(p.category);
            var tags = p.tags || [];
            var text = [p.name, catName, p.level, p.region, p.brief, (p.intro || '').slice(0, 160)].concat(tags).join(' ');
            var s = 0;
            if (p.name && q.indexOf(p.name) > -1) s += 40;
            tags.forEach(function (t) { if (t && q.indexOf(t) > -1) s += 14; });
            if (catName && q.indexOf(catName) > -1) s += 10;
            var city = cityOf(p.region);
            if (city && q.indexOf(city) > -1) s += 8;
            kws.forEach(function (k) {
                if (p.name.indexOf(k) > -1) s += 6;
                else if (tags.some(function (t) { return t.indexOf(k) > -1; })) s += 4;
                else if (catName.indexOf(k) > -1) s += 3;
                else if (text.indexOf(k) > -1) s += 1.2;
            });
            s += Math.min((p.popularity || 0) / 100000, 0.8);
            return { p: p, s: s };
        });
        list.sort(function (a, b) { return b.s - a.s; });
        return { list: list, kws: kws };
    }

    function describe(p) {
        var parts = [];
        parts.push('【' + p.name + '】' + (p.level ? '（' + p.level + '）' : ''));
        var meta = [categoryName(p.category), p.region, p.year ? p.year + ' 年入选' : null].filter(Boolean).join(' · ');
        if (meta) parts.push(meta);
        if (p.brief) parts.push(p.brief);
        var intro = String(p.intro || '').split('。')[0];
        if (intro && intro !== p.brief) parts.push(intro + '。');
        if (p.features && p.features.length) parts.push('看点：' + p.features.slice(0, 3).join('、'));
        return parts.join('\n');
    }

    function byCategoryHint(question) {
        for (var i = 0; i < CATEGORY_HINTS.length; i++) {
            var hint = CATEGORY_HINTS[i];
            var hit = hint.keys.some(function (k) { return question.indexOf(k) > -1; });
            if (!hit) continue;
            var list = projects().filter(function (p) { return categoryName(p.category) === hint.cat; });
            if (list.length) return { cat: hint.cat, list: list };
        }
        return null;
    }

    /**
     * 本地知识库回答
     * @param {string} question
     * @returns {{answer:string, match:{id:string,name:string}|null}}
     */
    function localAnswer(question) {
        var q = String(question || '').trim();
        if (!q) {
            return { answer: '想问点什么？比如“什么是钧瓷的窑变”“河南有哪些戏曲”。', match: null };
        }
        if (!projects().length) {
            return {
                answer: '本地数据还没加载完成，刷新一下页面再问我就好。',
                match: null
            };
        }

        var ranked = scoreAll(q);
        var strong = ranked.list.filter(function (x) { return x.s >= 12; });
        var hint = byCategoryHint(q);

        if (strong.length) {
            var top = strong.slice(0, 2).map(function (x) { return x.p; });
            var answer = [describe(top[0])];
            if (top[1]) answer.push('\n相关项目还有「' + top[1].name + '」：' + (top[1].brief || ''));
            answer.push('\n想深入看的话，可以打开项目详情查工艺流程与传承人，也可以直接用这个母题发起一个共创项目。');
            return { answer: answer.join('\n'), match: { id: top[0].id, name: top[0].name } };
        }

        if (hint) {
            var list = hint.list.slice().sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); }).slice(0, 6);
            var lines = ['平台收录的「' + hint.cat + '」共有 ' + hint.list.length + ' 项，其中比较有代表性的：'];
            list.forEach(function (p) { lines.push('· ' + p.name + '（' + (p.region || '河南') + '）：' + (p.brief || '')); });
            lines.push('\n点开任意一项可以看它的历史源流、工艺流程与代表性传承人。');
            return { answer: lines.join('\n'), match: { id: list[0].id, name: list[0].name } };
        }

        if (/推荐|适合|文创|设计|产品|伴手礼|礼物|周边/.test(q)) {
            var CRAFTY = ['传统技艺', '传统美术', '传统戏剧'];
            var picks = projects()
                .filter(function (p) { return CRAFTY.indexOf(categoryName(p.category)) > -1; })
                .sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); })
                .slice(0, 5);
            var recLines = ['如果是做文创，建议从“视觉符号明确、工艺能被转译”的项目入手，这几个最常被选中：'];
            picks.forEach(function (p) { recLines.push('· ' + p.name + '（' + categoryName(p.category) + '｜' + (p.region || '河南') + '）：' + (p.brief || '')); });
            recLines.push('\n切入角度可以从三处找：纹样（主形做四方连续）、色彩（传统配色三色组合）、器形与工艺痕迹（保留手作的“不完美”）。选定母题后可以在「共创广场」发起项目，找设计伙伴一起落地。');
            return { answer: recLines.join('\n'), match: picks[0] ? { id: picks[0].id, name: picks[0].name } : null };
        }

        if (/有哪些|有什么|介绍|概览|全部/.test(q) && ranked.kws.length <= 4) {
            var hot = projects().slice().sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); }).slice(0, 6);
            var out = ['平台按国家级、省级等层级收录了 ' + projects().length + ' 个河南非遗项目，覆盖十大分类。热度较高的有：'];
            hot.forEach(function (p) { out.push('· ' + p.name + '（' + categoryName(p.category) + '｜' + (p.region || '河南') + '）'); });
            out.push('\n你也可以按分类浏览，或告诉我一个具体方向（比如“想找能做文创的陶瓷类项目”）。');
            return { answer: out.join('\n'), match: { id: hot[0].id, name: hot[0].name } };
        }

        var suggestions = ranked.list.slice(0, 3).map(function (x) { return '· ' + x.p.name + '：' + (x.p.brief || ''); });
        return {
            answer: [
                '没有直接找到和「' + q + '」高度相关的内容。平台里可以试试这些方向：'
            ].concat(suggestions, [
                '\n换个说法也可以，比如直接说项目名（豫剧 / 钧瓷 / 汴绣 / 少林功夫 / 太极拳），或者问我“某个分类里有哪些项目”。'
            ]).join('\n'),
            match: null
        };
    }

    window.localAnswer = localAnswer;
    window.ICHLocalKB = { localAnswer: localAnswer };
})();
