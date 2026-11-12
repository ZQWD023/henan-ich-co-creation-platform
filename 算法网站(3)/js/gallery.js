// gallery.js - 数字展馆页面

// 展馆（按门类组织）
const halls = [
    { id: 'tiyu-zaji', name: '功夫·体育馆' },
    { id: 'chuantong-xiju', name: '戏曲·曲艺馆' },
    { id: 'chuantong-jiyi', name: '陶瓷·技艺馆' },
    { id: 'chuantong-meishu', name: '美术·手作馆' },
    { id: 'minsu', name: '民俗·节庆馆' },
    { id: 'chuantong-yiyao', name: '医药·养生馆' }
];

document.addEventListener('DOMContentLoaded', function () {
    renderSiteHeader('gallery');
    renderSiteFooter();

    // 渲染展馆筛选
    const filters = document.getElementById('hall-filters');
    halls.forEach(h => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.setAttribute('data-hall', h.id);
        btn.textContent = h.name;
        filters.appendChild(btn);
    });

    loadGallery('all');

    filters.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        filters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadGallery(btn.getAttribute('data-hall'));
    });

    // 弹窗
    document.getElementById('lb-close').addEventListener('click', () => document.getElementById('lightbox').classList.remove('show'));
    document.getElementById('lightbox').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });
});

function loadGallery(hallId) {
    let items = heritageProjects;
    if (hallId !== 'all') items = items.filter(p => p.category === hallId);
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = items.map(p => {
        const cat = ICH.getCategory(p.category);
        return `
        <div class="gallery-card" onclick="openLightbox('${p.id}')">
            ${coverHTML(p, { cls: 'gallery-cover', iconSize: '2.6rem', name: false })}
            <div class="gallery-info">
                <h3>${p.name}</h3>
                <div class="g-meta"><i class="fas ${cat ? cat.icon : 'fa-tag'}"></i> ${cat ? cat.name : ''} · ${p.region} · ${p.year}年入选</div>
                <p class="g-brief">${p.brief}</p>
            </div>
        </div>`;
    }).join('');
}

function openLightbox(id) {
    const p = ICH.getProject(id);
    if (!p) return;
    const cat = ICH.getCategory(p.category);
    const inheritors = ICH.getInheritorsByProject(p.id);

    document.getElementById('lb-title').textContent = p.name;
    document.getElementById('lb-body').innerHTML = `
        ${coverHTML(p, { cls: 'gallery-cover', height: '220px', iconSize: '4rem', name: false, badge: false })}
        <div class="detail-meta" style="margin-top:1rem;">
            <span class="badge-level">${p.level}</span>
            <span class="badge-cat"><i class="fas ${cat ? cat.icon : 'fa-tag'}"></i> ${cat ? cat.name : ''}</span>
            <span><i class="fas fa-map-marker-alt"></i> ${p.region}</span>
            <span><i class="fas fa-calendar"></i> ${p.year} 年入选</span>
        </div>
        <p style="color:var(--ink-3);margin:.8rem 0;font-size:.95rem;">${p.brief}</p>

        <div class="content-section" style="margin-bottom:.8rem;">
            <h2 style="font-size:1.15rem;"><i class="fas fa-circle-info"></i> 项目简介</h2>
            <p>${p.intro}</p>
        </div>
        <div class="content-section" style="margin-bottom:.8rem;">
            <h2 style="font-size:1.15rem;"><i class="fas fa-scroll"></i> 历史渊源</h2>
            <p>${p.history}</p>
        </div>
        <div class="content-section" style="margin-bottom:.8rem;">
            <h2 style="font-size:1.15rem;"><i class="fas fa-gem"></i> 技艺特点</h2>
            <ul class="feature-list">${p.features.map(f => `<li><i class="fas fa-check-circle"></i> ${f}</li>`).join('')}</ul>
        </div>
        ${inheritors.length ? `
        <div class="content-section" style="margin-bottom:.8rem;">
            <h2 style="font-size:1.15rem;"><i class="fas fa-hand-fist"></i> 代表性传承人</h2>
            ${inheritors.map(i => `<p style="margin-bottom:.4rem;"><b>${i.name}</b> · ${i.title}（从艺 ${i.years} 年）</p>`).join('')}
        </div>` : ''}
        <div style="margin-top:.6rem;display:flex;gap:10px;justify-content:flex-end;">
            <a class="btn btn-outline btn-sm" href="project-detail.html?id=${p.id}">查看完整详情 <i class="fas fa-arrow-right"></i></a>
        </div>`;

    document.getElementById('lightbox').classList.add('show');
}
