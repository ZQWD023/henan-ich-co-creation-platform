// inheritors.js - 传承人名录页面

document.addEventListener('DOMContentLoaded', function () {
    renderSiteHeader('inheritors');
    renderSiteFooter();

    loadInheritors('all');

    document.querySelectorAll('#level-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#level-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadInheritors(btn.getAttribute('data-level'));
        });
    });
});

function loadInheritors(level) {
    let list = inheritors;
    if (level !== 'all') list = list.filter(i => i.level === level);
    const container = document.getElementById('inheritor-list');

    container.innerHTML = list.map(i => {
        const project = ICH.getProject(i.projectId);
        const photo = getRelativePath('img/inheritors/' + i.id + '.jpg');
        return `
        <div class="inheritor-card">
            <div class="inheritor-avatar">
                <i class="fas ${i.icon}"></i>
                <img class="inheritor-photo" src="${photo}" alt="${i.name}" loading="lazy" decoding="async" onerror="this.remove()">
            </div>
            <h3>${i.name}</h3>
            <span class="inheritor-level">${i.level}传承人</span>
            <p class="title">${i.title}</p>
            <p class="bio">${i.bio}</p>
            <div class="list-meta" style="justify-content:center;margin-bottom:.6rem;">
                <span><i class="fas fa-map-marker-alt"></i> ${i.region}</span>
                <span><i class="fas fa-clock"></i> 从艺 ${i.years} 年</span>
            </div>
            ${project ? `<a class="btn btn-outline btn-sm" href="project-detail.html?id=${project.id}">查看「${project.name}」</a>` : ''}
        </div>`;
    }).join('');
}
