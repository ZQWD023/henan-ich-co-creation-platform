// projects.js - 非遗项目库页面（含真实河南非遗分布地图）

// 各市真实经纬度（用于投影到真实地图）
const cityLngLat = {
    '郑州': [113.625, 34.747],
    '开封': [114.348, 34.797],
    '洛阳': [112.454, 34.620],
    '焦作': [113.242, 35.216],
    '许昌': [113.852, 34.035],
    '平顶山': [113.193, 33.766],
    '信阳': [114.091, 32.147],
    '南阳': [112.528, 32.991],
    '周口': [114.650, 33.620],
    '驻马店': [114.024, 33.011],
    '鹤壁': [114.297, 35.748],
    '商丘': [115.656, 34.414],
    '漯河': [114.016, 33.581],
    '濮阳': [115.041, 35.762]
};

// 黄河（流经河南北部）示意轨迹点
const riverLngLat = [
    [110.7, 34.6], [111.0, 34.7], [111.6, 34.8], [112.0, 34.85], [112.4, 34.95],
    [112.9, 35.0], [113.2, 34.95], [113.5, 34.9], [113.9, 34.95], [114.3, 34.9],
    [114.6, 35.05], [115.0, 35.3], [115.4, 35.6], [115.7, 35.9]
];

// 备用（离线时的近似）城市坐标，正式坐标加载真实边界后由投影覆盖
let cityPositions = {
    '郑州': { x: 225, y: 170 }, '开封': { x: 268, y: 162 }, '洛阳': { x: 128, y: 195 },
    '焦作': { x: 205, y: 98 }, '许昌': { x: 243, y: 238 }, '平顶山': { x: 222, y: 285 },
    '信阳': { x: 300, y: 398 }, '南阳': { x: 150, y: 360 }, '周口': { x: 300, y: 252 },
    '驻马店': { x: 265, y: 330 }, '鹤壁': { x: 243, y: 82 }, '商丘': { x: 358, y: 160 },
    '漯河': { x: 275, y: 272 }, '濮阳': { x: 330, y: 86 }
};

const FALLBACK_OUTLINE = "M130,55 L175,40 L235,42 L300,55 L345,70 L385,105 L410,155 L415,215 L400,285 L395,350 L350,415 L285,445 L215,455 L150,430 L105,390 L70,330 L55,255 L60,190 L70,130 L95,90 Z";
const FALLBACK_RIVER = "M66,196 Q150,158 230,170 T345,96";

document.addEventListener('DOMContentLoaded', function () {
    renderSiteHeader('projects');
    renderSiteFooter();
    renderHenanMap();

    const params = new URLSearchParams(window.location.search);
    // 分类参数兼容 id（chuantong-xiju）与中文名（传统戏剧），首页卡片/导航都指向这里
    const categoryId = resolveCategory(params.get('category'));
    const level = params.get('level') || 'all';
    const region = params.get('region') || 'all';

    // 渲染地区筛选
    const regionFilters = document.getElementById('region-filters');
    ICH.getAllRegions().forEach(r => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn' + (r === region ? ' active' : '');
        btn.setAttribute('data-region', r);
        btn.textContent = r;
        regionFilters.appendChild(btn);
    });

    // 十大分类快速切换条
    renderCategoryChips(categoryId);

    // 若从分类进入，显示面包屑与"当前分类"提示
    if (categoryId !== 'all') {
        const cat = ICH.getCategory(categoryId);
        document.getElementById('crumb-category').textContent = cat ? cat.name : '非遗项目库';
        document.querySelector('.page-hero h1').innerHTML =
            `<i class="fas ${cat ? cat.icon : 'fa-book-open'}"></i> ${cat ? cat.name : '非遗项目库'}`;
        if (cat) {
            document.querySelector('.page-hero p').textContent = cat.description;
        }
    }

    loadProjects(categoryId, level, region);

    // 从首页分类卡片进来时，直接把视线带到"分类切换 + 结果列表"，
    // 不用先滑过整张地图，点击后立刻能看到该分类的项目
    if (categoryId !== 'all' && !location.hash) {
        const anchor = document.getElementById('category-chips');
        if (anchor) {
            setTimeout(() => {
                const top = anchor.getBoundingClientRect().top + window.scrollY - 96;
                window.scrollTo({ top, behavior: 'smooth' });
            }, 260);
        }
    }

    // 级别筛选：进入页面时同步 URL 上的 level（首页"国家级项目"数字点进来就是国家级）
    document.querySelectorAll('#level-filters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-level') === level);
        btn.addEventListener('click', () => {
            document.querySelectorAll('#level-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadProjects(categoryId, btn.getAttribute('data-level'), region);
        });
    });

    document.getElementById('region-filters').addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        document.querySelectorAll('#region-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadProjects(categoryId, level, btn.getAttribute('data-region'));
    });

    document.getElementById('search-btn').addEventListener('click', () => loadProjects(categoryId, level, region));
    document.getElementById('project-search').addEventListener('keyup', e => { if (e.key === 'Enter') loadProjects(categoryId, level, region); });
});

/** 把 URL 里的分类参数统一成分类 id；无法识别时返回 all */
function resolveCategory(raw) {
    if (!raw) return 'all';
    if (raw === 'all') return 'all';
    if (ICH.getCategory(raw)) return raw;
    const decoded = (() => { try { return decodeURIComponent(raw); } catch (e) { return raw; } })();
    const hit = ichCategories.find(c => c.name === decoded || c.name.split('·')[0] === decoded);
    return hit ? hit.id : 'all';
}

/** 十大分类切换条：在任何分类页都能一键换到别的分类 */
function renderCategoryChips(activeId) {
    const box = document.getElementById('category-chips');
    if (!box) return;
    box.innerHTML = [
        `<a class="filter-btn${activeId === 'all' ? ' active' : ''}" href="projects.html">全部分类</a>`,
        ...ichCategories.map(c => {
            const active = c.id === activeId ? ' active' : '';
            return `<a class="filter-btn${active}" href="projects.html?category=${encodeURIComponent(c.id)}"><i class="fas ${c.icon}"></i> ${c.name}</a>`;
        })
    ].join('');
}


// 按城市聚合非遗项目
function buildCityMap() {
    const map = {};
    heritageProjects.forEach(p => {
        const city = cityOf(p.region);
        (map[city] = map[city] || []).push(p);
    });
    return map;
}

function renderHenanMap() {
    const container = document.getElementById('henan-map');
    if (!container) return;
    const cityMap = buildCityMap();

    const dots = Object.keys(cityPositions).map(city => {
        const pos = cityPositions[city];
        const projects = cityMap[city] || [];
        if (!projects.length) return '';
        return `<g class="map-city" data-city="${city}" transform="translate(${pos.x},${pos.y})">
            <circle class="map-hit" r="17" fill="transparent"></circle>
            <circle class="map-halo" r="11"></circle>
            <circle class="map-dot" r="4.5"></circle>
            <text class="city-label" y="-19" text-anchor="middle">${city}</text>
        </g>`;
    }).join('');

    container.innerHTML = `
        <div class="map-head">
            <h3><i class="fas fa-map-location-dot"></i> 河南非遗分布地图</h3>
            <div class="map-legend">
                <span><span class="dot-sample"></span> 有非遗项目的地区</span>
                <span><i class="fas fa-mouse-pointer"></i> 悬停看项目 · 点击进详情</span>
            </div>
        </div>
        <div class="map-wrap" id="map-wrap">
            <svg class="map-svg" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="河南省非遗项目分布地图">
                <path class="map-outline" d="${FALLBACK_OUTLINE}"/>
                <path class="map-river" d="${FALLBACK_RIVER}"/>
                <text class="map-watermark" x="250" y="290" text-anchor="middle">河南省</text>
                ${dots}
            </svg>
            <div class="map-tooltip" id="map-tooltip"></div>
        </div>`;

    bindMapEvents(cityMap);
    loadRealMap();
}

// 加载真实河南边界（数据来源：阿里云 DataV 官方行政区划 GeoJSON），并投影为 SVG
function loadRealMap() {
    fetch('https://geo.datav.aliyun.com/areas_v3/bound/410000.json')
        .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(data => {
            const ring = data.features[0].geometry.coordinates[0][0];
            if (!ring || ring.length < 10) return;
            const proj = buildProjection(ring);

            // 更新轮廓
            const outline = document.querySelector('.map-outline');
            if (outline) outline.setAttribute('d', proj.path);

            // 更新黄河
            const river = document.querySelector('.map-river');
            if (river) river.setAttribute('d', buildPolylinePath(riverLngLat, proj.toSVG));

            // 更新城市光点位置
            const newPos = {};
            Object.keys(cityLngLat).forEach(city => {
                const [x, y] = proj.toSVG(cityLngLat[city][0], cityLngLat[city][1]);
                newPos[city] = { x: x, y: y };
                const g = document.querySelector(`.map-city[data-city="${city}"]`);
                if (g) g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
            });
            cityPositions = newPos;
        })
        .catch(() => { /* 网络不可用时保留备用轮廓 */ });
}

// 根据边界点计算等距柱状投影
function buildProjection(ring) {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    ring.forEach(p => {
        const lng = p[0], lat = p[1];
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    });
    const cos = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const raw = (lng, lat) => [(lng - minLng) * cos, maxLat - lat];

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const pts = ring.map(p => raw(p[0], p[1]));
    pts.forEach(q => {
        if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0];
        if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1];
    });

    const VB = 500, pad = 16;
    const w = maxX - minX, h = maxY - minY;
    const s = Math.min((VB - 2 * pad) / w, (VB - 2 * pad) / h);
    const offX = (VB - w * s) / 2, offY = (VB - h * s) / 2;

    const toSVG = (lng, lat) => {
        const q = raw(lng, lat);
        return [offX + (q[0] - minX) * s, offY + (q[1] - minY) * s];
    };

    const pathPts = pts.map(q => `${(offX + (q[0] - minX) * s).toFixed(1)},${(offY + (q[1] - minY) * s).toFixed(1)}`);
    return { path: 'M' + pathPts.join(' L') + ' Z', toSVG: toSVG };
}

function buildPolylinePath(points, toSVG) {
    return 'M' + points.map(p => { const q = toSVG(p[0], p[1]); return `${q[0].toFixed(1)},${q[1].toFixed(1)}`; }).join(' L');
}

function bindMapEvents(cityMap) {
    const tip = document.getElementById('map-tooltip');
    const wrap = document.getElementById('map-wrap');
    const svg = wrap.querySelector('svg');
    let hideTimer = null;

    const hide = () => { tip.style.display = 'none'; };
    const scheduleHide = () => { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 260); };

    document.querySelectorAll('.map-city').forEach(g => {
        g.addEventListener('mouseenter', function () {
            clearTimeout(hideTimer);
            showTip(this, cityMap, svg, wrap, tip);
        });
        g.addEventListener('mouseleave', scheduleHide);
        g.addEventListener('click', function () {
            const city = this.getAttribute('data-city');
            window.location.href = 'projects.html?region=' + encodeURIComponent(city);
        });
    });

    tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    tip.addEventListener('mouseleave', scheduleHide);
    window.addEventListener('resize', hide);
}

function showTip(g, cityMap, svg, wrap, tip) {
    const city = g.getAttribute('data-city');
    const pos = cityPositions[city];
    if (!pos) return;
    const projects = cityMap[city] || [];

    tip.innerHTML = `
        <h4><i class="fas fa-map-marker-alt"></i> ${city}市</h4>
        <ul>${projects.map(p => `
            <li>
                <a href="project-detail.html?id=${p.id}">${p.name}</a>
                <span>${p.brief}</span>
            </li>`).join('')}
        </ul>
        <a class="tooltip-more" href="projects.html?region=${encodeURIComponent(city)}">查看该市全部非遗 <i class="fas fa-arrow-right"></i></a>`;

    tip.style.display = 'block';
    tip.style.transform = 'none';

    const svgRect = svg.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const scaleX = svgRect.width / 500;
    const scaleY = svgRect.height / 500;
    const cx = (svgRect.left - wrapRect.left) + pos.x * scaleX;
    const cy = (svgRect.top - wrapRect.top) + pos.y * scaleY;

    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = cx + 18;
    let top = cy - th / 2;
    if (left + tw > wrapRect.width - 8) left = cx - tw - 18;
    left = Math.max(8, Math.min(left, wrapRect.width - tw - 8));
    top = Math.max(8, Math.min(top, wrapRect.height - th - 8));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
}

function loadProjects(categoryId, level, region) {
    const query = document.getElementById('project-search').value.trim();
    let list = ICH.searchProjects(query);

    if (categoryId && categoryId !== 'all') list = list.filter(p => p.category === categoryId);
    if (level && level !== 'all') list = list.filter(p => p.level === level);
    if (region && region !== 'all') list = list.filter(p => cityOf(p.region) === region);

    // 结果统计条
    const countEl = document.getElementById('project-count');
    if (countEl) {
        const cat = categoryId && categoryId !== 'all' ? ICH.getCategory(categoryId) : null;
        countEl.innerHTML = `共 <b>${list.length}</b> 个项目` +
            (cat ? ` · 当前分类：<b>${cat.name}</b>` : '') +
            (level && level !== 'all' ? ` · ${level}` : '') +
            (region && region !== 'all' ? ` · ${region}市` : '');
    }

    const container = document.getElementById('project-list');
    if (!list.length) {
        container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
            <i class="fas fa-search"></i><h3>未找到相关非遗项目</h3><p>请尝试调整筛选条件或搜索关键词</p>
            <button class="btn btn-outline" onclick="resetFilters()">清除筛选</button></div>`;
        return;
    }
    container.innerHTML = list.map(projectCard).join('');
}

function projectCard(p) {
    const cat = ICH.getCategory(p.category);
    return `
    <a class="project-card" href="project-detail.html?id=${p.id}">
        ${coverHTML(p)}
        <div class="project-body">
            <h3>${p.name}</h3>
            <div class="project-region"><i class="fas fa-map-marker-alt"></i> ${p.region} · ${cat ? cat.name : ''}</div>
            <p class="project-brief">${p.brief}</p>
            <div class="work-tags">${(p.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}</div>
            <div class="project-meta">
                <span><i class="fas fa-eye"></i> ${fmt(p.popularity)}</span>
                <span><i class="fas fa-calendar"></i> ${p.year} 年入选</span>
                <span class="likes"><i class="fas fa-heart"></i> ${fmt(p.likes)}</span>
            </div>
        </div>
    </a>`;
}

function resetFilters() {
    document.getElementById('project-search').value = '';
    document.querySelectorAll('#level-filters .filter-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-level') === 'all'));
    document.querySelectorAll('#region-filters .filter-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-region') === 'all'));
    loadProjects('all', 'all', 'all');
}

function fmt(n) { return n >= 10000 ? (n / 10000).toFixed(1) + '万' : n; }
