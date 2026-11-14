// project-detail.js - 非遗项目详情页

document.addEventListener('DOMContentLoaded', function () {
    renderSiteHeader('projects');
    renderSiteFooter();

    // 浏览非遗项目解锁「初识非遗」成就
    if (getUserData()) unlockAchievement('first-visit');

    const id = new URLSearchParams(window.location.search).get('id');
    const project = ICH.getProject(id);
    const container = document.getElementById('detail-content');

    if (!project) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-circle-question"></i><h3>项目不存在</h3><p>未找到该非遗项目</p><a href="projects.html" class="btn">返回项目库</a></div>`;
        return;
    }

    document.title = project.name + ' - 河南省非遗共创平台';
    document.getElementById('breadcrumb-name').textContent = project.name;

    const cat = ICH.getCategory(project.category);
    const inheritors = ICH.getInheritorsByProject(project.id);
    const favorited = isFavorited(project.id);

    container.innerHTML = `
        <div class="detail-hero">
            ${coverHTML(project, { cls: 'detail-cover', iconSize: '5rem', badge: false, name: false })}
            <div class="detail-info">
                <h1>${project.name}</h1>
                <div class="detail-meta">
                    <span class="badge-level">${project.level}</span>
                    <span class="badge-cat"><i class="fas ${cat ? cat.icon : 'fa-tag'}"></i> ${cat ? cat.name : ''}</span>
                    <span><i class="fas fa-map-marker-alt"></i> ${project.region}</span>
                    <span><i class="fas fa-calendar"></i> ${project.year} 年入选</span>
                    <span><i class="fas fa-eye"></i> ${fmt(project.popularity)} 浏览</span>
                    <span><i class="fas fa-heart" style="color:var(--danger);"></i> ${fmt(project.likes)} 喜爱</span>
                </div>
                <p style="font-size:1.05rem;color:var(--ink-3);">${project.brief}</p>
                <div class="action-bar">
                    <button class="action-btn ${favorited ? 'favorited' : ''}" id="fav-btn">
                        <i class="fas ${favorited ? 'fa-bookmark' : 'fa-bookmark'}"></i> ${favorited ? '已收藏' : '收藏项目'}
                    </button>
                    <a class="action-btn" href="co-create.html?project=${project.id}"><i class="fas fa-lightbulb"></i> 参与共创</a>
                    <a class="action-btn" href="projects.html"><i class="fas fa-arrow-left"></i> 返回列表</a>
                </div>
            </div>
        </div>

        <div class="content-section">
            <h2><i class="fas fa-circle-info"></i> 项目简介</h2>
            <p>${project.intro}</p>
        </div>

        <div class="content-section">
            <h2><i class="fas fa-scroll"></i> 历史渊源</h2>
            <p>${project.history}</p>
        </div>

        ${project.lineage ? `
        <div class="content-section">
            <h2><i class="fas fa-people-arrows"></i> 传承谱系</h2>
            <p>${project.lineage}</p>
        </div>` : ''}

        <div class="content-section">
            <h2><i class="fas fa-gem"></i> 技艺特点</h2>
            <ul class="feature-list">
                ${project.features.map(f => `<li><i class="fas fa-check-circle"></i> ${f}</li>`).join('')}
            </ul>
        </div>

        ${project.steps && project.steps.length ? `
        <div class="content-section">
            <h2><i class="fas fa-list-ol"></i> 工艺流程</h2>
            <ol class="step-list">
                ${project.steps.map((st, i) => `<li><span class="step-no">${i + 1}</span><span class="step-text">${st}</span></li>`).join('')}
            </ol>
        </div>` : ''}

        ${project.visit ? `
        <div class="content-section">
            <h2><i class="fas fa-location-dot"></i> 体验与参观</h2>
            <p>${project.visit}</p>
        </div>` : ''}

        <div class="content-section">
            <h2><i class="fas fa-tags"></i> 相关标签</h2>
            <div class="tag-list">${project.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
        </div>

        <div class="content-section">
            <h2><i class="fas fa-hand-fist"></i> 代表性传承人</h2>
            ${inheritors.length ? `
                <div class="project-grid" style="margin-top:1rem;">
                    ${inheritors.map(i => `
                        <div class="inheritor-card">
                            <div class="inheritor-avatar">
                                <i class="fas ${i.icon}"></i>
                                <img class="inheritor-photo" src="${getRelativePath('img/inheritors/' + i.id + '.jpg')}" alt="${i.name}" loading="lazy" decoding="async" onerror="this.remove()">
                            </div>
                            <h3>${i.name}</h3>
                            <span class="inheritor-level">${i.level}</span>
                            <p class="title">${i.title}</p>
                            <p class="bio">${i.bio}</p>
                            <span class="years"><i class="fas fa-clock"></i> 从艺 ${i.years} 年</span>
                        </div>`).join('')}
                </div>
                <div style="margin-top:1.2rem;"><a href="inheritors.html" class="btn btn-outline btn-sm">查看全部传承人 <i class="fas fa-arrow-right"></i></a></div>`
            : `<p style="color:var(--muted);">暂无传承人信息，欢迎<a href="inheritors.html" style="color:var(--primary);">了解其他传承人</a>。</p>`}
        </div>

        <div class="content-section">
            <h2><i class="fas fa-lightbulb"></i> 相关共创作品</h2>
            <div class="project-grid" id="related-works" style="margin-top:1rem;"></div>
        </div>`;

    // 渲染相关共创作品
    // 渲染相关共创作品（数据来自后端 /works?heritageId=）
    loadRelatedWorks(project.id);

    document.getElementById('fav-btn').addEventListener('click', function () {
        toggleFavorite(project.id, project.name);
        const f = isFavorited(project.id);
        this.classList.toggle('favorited', f);
        this.innerHTML = `<i class="fas fa-bookmark"></i> ${f ? '已收藏' : '收藏项目'}`;
    });
});

function fmt(n) { return n >= 10000 ? (n / 10000).toFixed(1) + '万' : n; }


/* ============ 相关共创作品：走后端 ============ */
async function loadRelatedWorks(heritageId) {
    const rw = document.getElementById('related-works');
    if (!rw) return;
    if (!window.API || !window.API.works) return;
    try {
        const data = await window.API.works.list({ heritageId: heritageId, pageSize: 6 });
        const list = data.list || [];
        if (!list.length) {
            rw.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);">暂无相关共创作品，<a href="co-create.html" style="color:var(--primary);">去共创广场</a>贡献创意。</div>';
            return;
        }
        rw.innerHTML = list.map(function (w) {
            const cover = heritageCoverHTML(w, {
                cls: 'work-cover',
                alt: w.title,
                pill: (w.workType || '作品'),
                pillClass: 'work-cat',
            });
            return '<div class="work-card">' +
                cover +
                '<div class="work-body"><h3>' + w.title + '</h3>' +
                '<div class="work-author"><i class="fas fa-user-pen"></i> ' + (w.author ? w.author.displayName : '') + '</div>' +
                '<p class="work-desc">' + (w.summary || '') + '</p>' +
                '<div class="work-actions"><span class="likes"><i class="fas fa-thumbs-up"></i> ' + (w.likesCount || 0) + '</span>' +
                '<span class="likes"><i class="fas fa-eye"></i> ' + (w.viewsCount || 0) + '</span></div>' +
                '</div></div>';
        }).join('');
    } catch (e) {
        rw.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);">相关作品加载失败：' + (e.message || '') + '</div>';
    }
}
