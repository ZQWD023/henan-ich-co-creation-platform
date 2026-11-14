/* ai-lab.js —— AI 共创实验室：Agent 工作流 + 端侧多模态检索
 *
 * 结构：
 *   1. initTabs     —— 面板切换（带 aria 状态）
 *   2. initAgent    —— 调用 /api/ai/agent/stream，逐步渲染工具调用轨迹与方案
 *   3. initVision   —— 端侧特征提取 + 余弦相似度检索（图片不出浏览器）
 *   4. loadTools    —— 展示 Agent 的工具清单（Function Calling schema）
 */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

  /* ==================== 1. 面板切换 ==================== */
  function initTabs() {
    const tabs = $$('.lab-tab');
    const panels = $$('.lab-panel');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.classList.toggle('active', t === tab);
          t.setAttribute('aria-selected', String(t === tab));
        });
        panels.forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab.dataset.tab));
      });
    });
  }

  /* ==================== 2. Agent ==================== */
  const agent = { running: false, ctrl: null, result: null };

  function initAgent() {
    const input = $('#agent-goal');
    const runBtn = $('#agent-run');
    const cancelBtn = $('#agent-cancel');

    $('#agent-examples').addEventListener('click', (e) => {
      const chip = e.target.closest('.lab-example');
      if (!chip) return;
      input.value = chip.textContent.trim();
      input.focus();
    });

    runBtn.addEventListener('click', () => runAgent());
    cancelBtn.addEventListener('click', () => {
      if (agent.ctrl) agent.ctrl.abort();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAgent();
    });
  }

  function setAgentStatus(text, busy) {
    $('#agent-status').innerHTML = text || '';
    $('#agent-run').disabled = !!busy;
    $('#agent-cancel').disabled = !busy;
  }

  async function runAgent() {
    if (agent.running) return;
    const goal = $('#agent-goal').value.trim();
    if (!goal) {
      if (typeof showToast === 'function') showToast('先说说你想做什么', 'warning');
      $('#agent-goal').focus();
      return;
    }

    agent.running = true;
    agent.result = null;
    agent.ctrl = new AbortController();
    $('#agent-trace').innerHTML = '';
    $('#agent-result').innerHTML = '<div class="lab-empty"><span class="lab-spinner"></span> Agent 正在思考…</div>';
    setAgentStatus('<span class="lab-spinner"></span> 正在启动 Agent…', true);

    const startedAt = Date.now();
    let stepCount = 0;

    try {
      await window.AIClient.agentStream(
        { goal },
        {
          signal: agent.ctrl.signal,
          onEvent(evt) {
            if (evt.type === 'start') {
              setAgentStatus(`<span class="lab-spinner"></span> Agent 已启动，可调用 ${evt.toolCount} 个工具`, true);
            } else if (evt.type === 'step') {
              stepCount += 1;
              appendStep(evt.step);
              setAgentStatus(`<span class="lab-spinner"></span> 第 ${stepCount} 步：${esc(evt.step.toolTitle)}`, true);
            } else if (evt.type === 'result') {
              agent.result = evt.result;
              renderResult(evt.result);
            } else if (evt.type === 'error') {
              renderAgentError(evt.message);
            }
          },
        }
      );
      setAgentStatus(`完成：${stepCount} 次工具调用，用时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`, false);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        setAgentStatus('已停止', false);
        appendSystemNote('已手动停止，可重新规划。');
      } else {
        renderAgentError(err.message || 'Agent 执行失败');
        setAgentStatus('执行失败', false);
      }
    } finally {
      agent.running = false;
      agent.ctrl = null;
    }
  }

  function appendStep(step) {
    const wrap = $('#agent-trace');
    const el = document.createElement('div');
    el.className = 'lab-step';
    const args = Object.entries(step.args || {})
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    el.innerHTML = `
      <div class="lab-step-head">
        <span class="lab-step-no">${step.index}</span>
        <b style="font-size:.86rem;color:var(--ink);">${esc(step.toolTitle)}</b>
        <span class="lab-tool">${esc(step.tool)}(${esc(args)})</span>
        <span class="lab-ms">${step.durationMs < 1 ? '&lt;1ms' : step.durationMs + 'ms'}</span>
      </div>
      <div class="lab-step-thought">${esc(step.thought)}</div>
      <div class="lab-step-obs"><b>观察：</b>${esc(step.observation)}</div>`;
    wrap.appendChild(el);
  }

  function appendSystemNote(text) {
    const wrap = $('#agent-trace');
    const el = document.createElement('div');
    el.className = 'lab-empty';
    el.textContent = text;
    wrap.appendChild(el);
  }

  function renderAgentError(message) {
    $('#agent-result').innerHTML = `
      <div class="lab-card" style="border-color:rgba(176,36,90,.35);background:rgba(176,36,90,.04);">
        <h2 style="color:var(--danger);font-size:1rem;"><i class="fas fa-triangle-exclamation"></i> 这次没跑通</h2>
        <p class="lab-hint" style="margin:0;">${esc(message)}</p>
      </div>`;
  }

  function renderResult(r) {
    if (!r || !r.ok) {
      renderAgentError((r && r.message) || '没有找到匹配的非遗项目，换个说法试试');
      return;
    }
    const h = r.heritage || {};
    const p = r.proposal || {};
    const tasks = r.tasks || [];
    const cites = r.citations || [];

    const taskHtml = tasks
      .map(
        (t, i) => `
      <div class="lab-task">
        <span class="lab-task-idx">${i + 1}</span>
        <div>
          <div class="lab-task-title">${esc(t.title)}</div>
          <div class="lab-task-meta">${esc(t.role)} · 预估 ${esc(t.estimateDays)} 天${t.description ? ' · ' + esc(t.description) : ''}</div>
        </div>
      </div>`
      )
      .join('');

    $('#agent-result').innerHTML = `
      <div class="lab-proposal">
        <h3>${esc(p.title || h.name + '·共创方案')}</h3>
        <p class="lab-desc">${esc(p.description || '')}</p>
        <div class="lab-kv">
          <div><span>关联非遗：</span><b>${esc(h.name || '')}</b>（${esc(h.category || '')} · ${esc(h.level || '')} · ${esc(h.region || '')}）</div>
          <div><span>招募角色：</span>${esc(p.recruitNeed || '')}</div>
          <div><span>题材存量：</span>该题材已有 ${esc(r.worksCount || 0)} 件作品${(r.worksCount || 0) === 0 ? '（空白位，值得做）' : ''}</div>
        </div>
        <div style="font-size:.86rem;font-weight:600;color:var(--ink);margin-bottom:.3rem;">任务拆解（${tasks.length} 项）</div>
        <div class="lab-tasks">${taskHtml}</div>
        <div class="lab-actions">
          <button class="btn btn-sm" id="agent-publish"><i class="fas fa-paper-plane"></i> 发布为共创项目</button>
          <button class="btn btn-outline btn-sm" id="agent-copy"><i class="fas fa-copy"></i> 复制方案</button>
          <a class="btn btn-outline btn-sm" href="project-detail.html?id=${encodeURIComponent(h.id || '')}"><i class="fas fa-book-open"></i> 看项目详情</a>
        </div>
        ${cites.length ? `<div class="lab-cites">${cites.map((c) => `<span class="lab-cite">依据：${esc(c.heritageName)} · ${esc(c.section)}（${Math.round(c.similarity * 100)}%）</span>`).join('')}</div>` : ''}
      </div>`;

    const publishBtn = $('#agent-publish');
    if (publishBtn) publishBtn.addEventListener('click', publishProposal);
    const copyBtn = $('#agent-copy');
    if (copyBtn) copyBtn.addEventListener('click', () => copyProposal(p));
  }

  async function copyProposal(p) {
    const tasks = (agent.result && agent.result.tasks) || [];
    const text = [
      p.title,
      '',
      p.description,
      '',
      '招募：' + (p.recruitNeed || ''),
      '',
      '任务：',
      ...tasks.map((t, i) => `${i + 1}. ${t.title}（${t.role}，${t.estimateDays} 天）`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      if (typeof showToast === 'function') showToast('方案已复制，可以直接粘到文档里');
    } catch (e) {
      if (typeof showToast === 'function') showToast('复制失败，请手动选中文本', 'error');
    }
  }

  async function publishProposal() {
    const u = typeof getUserData === 'function' ? getUserData() : null;
    if (!u) {
      if (typeof showToast === 'function') showToast('发布前需要先登录', 'warning');
      setTimeout(() => {
        location.href = 'login.html?redirect=' + encodeURIComponent(location.href);
      }, 900);
      return;
    }
    if (!agent.result || !agent.result.proposal) return;
    const p = agent.result.proposal;

    const btn = $('#agent-publish');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="lab-spinner"></span> 发布中…';
    }
    try {
      const res = await window.API.projects.create({
        title: p.title,
        description: p.description,
        recruitNeed: p.recruitNeed,
        heritageId: p.heritageId,
        memberLimit: p.memberLimit || 6,
        publish: true,
      });
      const id = res && (res.id || (res.project && res.project.id));
      if (typeof showToast === 'function') showToast('已发布为共创项目');
      if (id)
        setTimeout(() => {
          location.href = 'co-project-detail.html?id=' + encodeURIComponent(id);
        }, 700);
      else if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> 发布为共创项目';
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message || '发布失败', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> 发布为共创项目';
      }
    }
  }

  /* ==================== 3. 以图搜非遗 ==================== */
  const vision = { ready: false, loading: false };

  function initVision() {
    const zone = $('#drop-zone');
    const file = $('#vision-file');

    zone.addEventListener('click', () => file.click());
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleVisionFile(f);
    });
    file.addEventListener('change', () => {
      if (file.files && file.files[0]) handleVisionFile(file.files[0]);
    });

    $('#vision-samples').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-img]');
      if (!chip) return;
      handleVisionSource(chip.dataset.img);
    });
  }

  function renderVisionNote(html) {
    $('#vision-note').innerHTML = html;
  }

  async function ensureVisionIndex() {
    if (vision.ready) return true;
    if (vision.loading) return false;
    vision.loading = true;
    renderVisionNote('<span class="lab-spinner"></span> 正在为图库提取端侧特征（首次约 2-3 秒）…');

    const projects = (window.ICH ? ICH.projects : []).map((p) => ({
      id: p.id,
      name: p.name,
      level: p.level,
      region: p.region,
      categoryName: (ICH.getCategory(p.category) || {}).name || '',
      img: getRelativePath('img/gallery/' + p.id + '.jpg'),
    }));

    try {
      await window.VisionSearch.buildIndex(projects, (done, total) => {
        if (done % 10 === 0 || done === total) {
          renderVisionNote(`<span class="lab-spinner"></span> 正在提取特征 ${done}/${total}…`);
        }
      });
      vision.ready = true;
      vision.loading = false;
      renderVisionNote(`已为 ${projects.length} 个项目建立端侧特征索引（72 维/图），图片始终留在本机。`);
      return true;
    } catch (err) {
      vision.loading = false;
      renderVisionNote('特征索引构建失败，请刷新重试。');
      return false;
    }
  }

  function handleVisionFile(f) {
    if (!f.type.startsWith('image/')) {
      if (typeof showToast === 'function') showToast('请选择图片文件', 'error');
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      if (typeof showToast === 'function') showToast('图片太大了，建议 8MB 以内', 'error');
      return;
    }
    handleVisionSource(f);
  }

  async function handleVisionSource(source) {
    if (!(await ensureVisionIndex())) return;
    $('#vision-results').innerHTML = '<div class="lab-empty"><span class="lab-spinner"></span> 正在比对…</div>';

    try {
      const { results, previewUrl } = await window.VisionSearch.search(source, 4);
      $('#vision-preview').innerHTML = `<img src="${previewUrl}" alt="你上传的图片" loading="lazy">`;
      renderVisionResults(results);
    } catch (err) {
      $('#vision-results').innerHTML = `<div class="lab-empty">比对失败：${esc(err.message)}</div>`;
    }
  }

  function renderVisionResults(results) {
    if (!results.length) {
      $('#vision-results').innerHTML = '<div class="lab-empty">没有找到相近的项目</div>';
      return;
    }
    $('#vision-results').innerHTML = results
      .map(
        (r) => `
      <a class="vision-item" href="project-detail.html?id=${encodeURIComponent(r.id)}" style="color:inherit;">
        <img src="${esc(r.img)}" alt="${esc(r.name)}" loading="lazy"
             onerror="this.style.visibility='hidden'">
        <div class="vision-info">
          <div class="vision-name">${esc(r.name)}</div>
          <div class="vision-meta">${esc(r.categoryName)} · ${esc(r.level || '')} · ${esc(r.region || '')}</div>
          <div class="vision-bar"><span style="width:${Math.max(4, r.similarity * 100).toFixed(1)}%"></span></div>
        </div>
        <div class="vision-pct">${(r.similarity * 100).toFixed(0)}%</div>
      </a>`
      )
      .join('');

    const top = results[0];
    renderVisionNote(
      `最接近的是 <b>${esc(top.name)}</b>（相似度 ${(top.similarity * 100).toFixed(0)}%）。相似度由颜色分布、边缘结构与明暗直方图共同决定，可作为"找可对标题材"的参考，而不是语义识别结论。`
    );
  }

  /* ==================== 4. 工具清单 ==================== */
  async function loadTools() {
    const box = $('#tools-list');
    if (!box) return;
    try {
      const data = await window.apiRequest('/ai/tools');
      const tools = (data && data.tools) || [];
      box.innerHTML =
        tools
          .map(
            (t, i) => `
        <div class="lab-step">
          <div class="lab-step-head">
            <span class="lab-step-no">${i + 1}</span>
            <b style="font-size:.86rem;color:var(--ink);">${esc(t.title)}</b>
            <span class="lab-tool">${esc(t.name)}</span>
          </div>
          <div class="lab-step-thought">${esc(t.description)}</div>
        </div>`
          )
          .join('') || '<div class="lab-empty">工具清单暂时不可用</div>';
    } catch (e) {
      box.innerHTML = '<div class="lab-empty">工具清单加载失败（后端未启动时会这样）</div>';
    }
  }

  /* ==================== 4. 纹样生成（多模态输出） ==================== */
  const patternState = { heritageId: 'junci', style: 'grid', seed: 1, last: null };

  function initPattern() {
    if (!window.PatternGenerator) return;

    const select = $('#pattern-heritage');
    const stylesBox = $('#pattern-styles');
    if (!select || !stylesBox) return;

    // 项目下拉：按分类分组，默认钧瓷
    const projects = (window.ICH ? ICH.projects : []).slice();
    select.innerHTML = projects
      .map((p) => {
        const cat = (ICH.getCategory(p.category) || {}).name || '';
        return `<option value="${esc(p.id)}">${esc(p.name)}${cat ? '　·　' + esc(cat) : ''}</option>`;
      })
      .join('');
    select.value = projects.some((p) => p.id === 'junci') ? 'junci' : (projects[0] || {}).id;
    patternState.heritageId = select.value;

    stylesBox.innerHTML = window.PatternGenerator.STYLES.map(
      (s, i) =>
        `<span class="lab-example${i === 0 ? ' active' : ''}" data-style="${esc(s.key)}" title="${esc(s.desc)}" style="${
          i === 0 ? 'border-color:var(--gold);color:var(--primary);background:var(--gold-soft);' : ''
        }">${esc(s.name)}</span>`
    ).join('');

    select.addEventListener('change', () => {
      patternState.heritageId = select.value;
      patternState.seed = 1;
      renderPattern();
    });

    stylesBox.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-style]');
      if (!chip) return;
      patternState.style = chip.dataset.style;
      $$('[data-style]', stylesBox).forEach((c) => {
        const on = c === chip;
        c.classList.toggle('active', on);
        c.style.borderColor = on ? 'var(--gold)' : '';
        c.style.color = on ? 'var(--primary)' : '';
        c.style.background = on ? 'var(--gold-soft)' : '';
      });
      patternState.seed = 1;
      renderPattern();
    });

    $('#pattern-generate').addEventListener('click', () => renderPattern());
    $('#pattern-reseed').addEventListener('click', () => {
      patternState.seed += 1;
      renderPattern();
    });
    $('#pattern-download').addEventListener('click', () => {
      if (!patternState.last) return;
      const { meta, dataUrl } = patternState.last;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `纹样_${meta.heritageName}_${meta.styleName}_${meta.seed}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    renderPattern();
  }

  function renderPattern() {
    const box = $('#pattern-preview');
    const metaBox = $('#pattern-meta');
    const palBox = $('#pattern-palette');
    const dl = $('#pattern-download');
    if (!box || !window.PatternGenerator) return;

    const result = window.PatternGenerator.generate({
      heritageId: patternState.heritageId,
      style: patternState.style,
      seed: patternState.seed,
      size: 720,
    });
    patternState.last = result;

    box.innerHTML = `
      <img src="${result.dataUrl}" alt="生成的纹样" style="width:100%;border-radius:12px;border:1px solid var(--border);box-shadow:var(--shadow);display:block;">
      <div style="font-size:.78rem;color:var(--muted);margin-top:.5rem;">
        ${esc(result.meta.heritageName)} · ${esc(result.meta.styleName)} · 种子 ${result.meta.seed} · ${result.meta.size}×${result.meta.size}
      </div>`;

    metaBox.innerHTML = `<i class="fas fa-circle-check" style="color:var(--success)"></i> 已生成：<b>${esc(
      result.meta.styleName
    )}</b>（${esc(result.meta.heritageName)} 配色，${result.palette.all.length} 色）。同样的种子会生成同一张图，方便迭代。</p>`;

    palBox.innerHTML =
      '<span class="citations-label"><i class="fas fa-swatchbook"></i> 取色</span>' +
      result.palette.all
        .map(
          (c) =>
            `<span class="lab-cite" style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:3px;background:${c};border:1px solid rgba(0,0,0,.15)"></span>${c}</span>`
        )
        .join('');

    dl.disabled = false;
  }

  /* ==================== 启动 ==================== */
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof renderSiteHeader === 'function') renderSiteHeader('ai-lab');
    if (typeof renderSiteFooter === 'function') renderSiteFooter();
    initTabs();
    initAgent();
    initVision();
    initPattern();
    loadTools();
  });
})();
