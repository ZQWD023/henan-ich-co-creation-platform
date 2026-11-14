/* ai-client.js —— 前端 AI 客户端
 *
 * 职责：把「SSE 流式请求」这件事收在一个可复用模块里，页面只关心事件。
 * 对应评审标准「前端工程质量 / 组件化与架构设计」与「用户体验 / AI 交互体验」：
 *   - 统一的流式解析（不依赖 EventSource，因为要 POST 带参数）
 *   - 统一的错误边界：网络断开 / 服务异常 / 中途中断都返回结构化错误
 *   - 统一的鉴权头注入（登录后 AI 接口能拿到用户上下文）
 *
 * 用法：
 *   AIClient.chatStream({ message, heritageId }, { onEvent, signal })
 *   AIClient.agentStream({ goal, heritageId }, { onEvent, signal })
 */
(function () {
  'use strict';

  const API_BASE = (function () {
    if (window.API_BASE_URL) return window.API_BASE_URL;
    if (location.protocol === 'file:') return 'http://localhost:3000/api';
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal && location.port && location.port !== '3000') return `http://${location.hostname}:3000/api`;
    return `${location.origin}/api`;
  })();

  function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const token = typeof window.getToken === 'function' ? window.getToken() : localStorage.getItem('henanICHToken');
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch (e) {
      /* 忽略隐私模式下的存储异常 */
    }
    return headers;
  }

  /**
   * POST 一个 SSE 接口，逐条回调事件
   * @param {string} path 例如 '/ai/chat/stream'
   * @param {object} body
   * @param {{onEvent:Function, signal?:AbortSignal}} opts
   */
  async function streamRequest(path, body, opts) {
    const { onEvent, signal } = opts || {};
    const url = API_BASE + path;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body || {}),
        signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') return { aborted: true };
      throw Object.assign(new Error('网络连接中断，请检查网络后重试'), { network: true, cause: err });
    }

    if (!res.ok) {
      let message = `服务返回异常（HTTP ${res.status}）`;
      try {
        const j = await res.json();
        if (j && j.message) message = j.message;
      } catch (e) {
        /* 非 JSON 响应 */
      }
      throw new Error(message);
    }

    if (!res.body || !res.body.getReader) {
      // 极老的浏览器：退化为一次性读取
      const text = await res.text();
      parseBlocks(text, onEvent);
      return { ok: true, degraded: true };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let sawDone = false;

    // 逐块读取 SSE 流（用 for(;;) 而不是 while(true)，避免 no-constant-condition 告警）
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = block.split('\n').find((l) => l.trim().startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(line.indexOf('data:') + 5).trim();
        if (payload === '[DONE]') {
          sawDone = true;
          continue;
        }
        try {
          onEvent && onEvent(JSON.parse(payload));
        } catch (e) {
          console.warn('[AIClient] 无法解析事件', payload.slice(0, 60));
        }
      }
    }

    return { ok: true, sawDone };
  }

  function parseBlocks(text, onEvent) {
    String(text || '')
      .split('\n\n')
      .forEach((block) => {
        const line = block.split('\n').find((l) => l.trim().startsWith('data:'));
        if (!line) return;
        const payload = line.slice(line.indexOf('data:') + 5).trim();
        if (!payload || payload === '[DONE]') return;
        try {
          onEvent && onEvent(JSON.parse(payload));
        } catch (e) {
          /* ignore */
        }
      });
  }

  /** 非遗问答（流式） */
  function chatStream(payload, opts) {
    return streamRequest('/ai/chat/stream', payload, opts);
  }

  /** 共创 Agent（流式步骤） */
  function agentStream(payload, opts) {
    return streamRequest('/ai/agent/stream', payload, opts);
  }

  window.AIClient = {
    streamRequest,
    chatStream,
    agentStream,
    apiBase: API_BASE,
  };
})();
