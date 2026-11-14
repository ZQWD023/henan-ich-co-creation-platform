// tests/agent-llm.test.js —— LLM 自主规划模式（用注入的假模型驱动真正的 tool calling 循环）
//
// 意义：这条路径只有在配置了 QWEN_API_KEY 时才会走，但它的**逻辑**必须可验证。
// 我们用 __setTransport 注入一个按剧本返回 tool_calls 的"假模型"，
// 从而在没有 Key、没有网络的评审环境里也能证明：
//   1. 模型选工具 → 真实执行 → 结果回填 → 继续决策 这个循环是通的；
//   2. 模型漏调用工具时，会自动补齐，结果结构不缺失；
//   3. 模型给未知工具名不会崩；
//   4. LLM 失败时自动回落到规则模式（run 的兜底）。
const test = require('node:test');
const assert = require('node:assert');

const agent = require('../services/agent.service');

/** 造一个 tool_call 对象 */
function call(name, args, id) {
  return { id: id || 'call_' + name, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } };
}

test('LLM 模式：模型自主选工具，5 步跑通并产出可发布方案', async () => {
  const script = [
    { content: '先找项目', tool_calls: [call('search_heritage', { query: '钧瓷' })] },
    { content: '再看详情', tool_calls: [call('get_heritage_detail', { heritageId: 'junci' })] },
    { content: '查重', tool_calls: [call('list_related_works', { heritageId: 'junci', limit: 5 })] },
    { content: '拆任务', tool_calls: [call('suggest_tasks', { heritageId: 'junci', memberLimit: 6 })] },
    { content: '起草', tool_calls: [call('draft_project_brief', { heritageId: 'junci', angle: '文创产品' })] },
    { content: '方案已完成：以钧瓷窑变为母题，做一组日常茶器。', tool_calls: [] },
  ];
  let i = 0;
  agent.__setTransport(async () => script[Math.min(i++, script.length - 1)]);

  process.env.AGENT_PLANNER = 'llm';
  const steps = [];
  const r = await agent.run('帮我把钧瓷做成一套文创产品', { onStep: (s) => steps.push(s) });

  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.meta.planner, 'llm', '应记录为 LLM 规划');
  assert.ok(r.heritage && r.heritage.id === 'junci');
  assert.ok(r.proposal && r.proposal.title, '必须有可发布的方案标题');
  assert.ok(r.tasks.length >= 3, '任务应被真实拆出来');
  assert.strictEqual(r.trace.length, 5, '5 次工具调用都应有轨迹');
  assert.deepStrictEqual(
    r.trace.map((t) => t.tool),
    ['search_heritage', 'get_heritage_detail', 'list_related_works', 'suggest_tasks', 'draft_project_brief']
  );
  assert.strictEqual(steps.length, 5, 'onStep 应实时推送每一步');
  assert.ok(r.trace.every((t) => typeof t.durationMs === 'number' && t.observation));

  delete process.env.AGENT_PLANNER;
  agent.__setTransport(null);
});

test('LLM 模式：模型偷懒只检索不拆任务 → 自动补齐，结果仍完整', async () => {
  const script = [
    { content: '找项目', tool_calls: [call('search_heritage', { query: '汴绣' })] },
    { content: '好了', tool_calls: [] },
  ];
  let i = 0;
  agent.__setTransport(async () => script[Math.min(i++, script.length - 1)]);

  process.env.AGENT_PLANNER = 'llm';
  const r = await agent.run('用汴绣做丝巾');
  assert.strictEqual(r.ok, true);
  assert.ok(r.heritage && r.heritage.id === 'bianxiu', '应通过 search 结果补齐详情');
  assert.ok(r.proposal && r.proposal.title, '应补齐方案');
  assert.ok(r.tasks.length > 0, '应补齐任务');
  assert.ok(r.trace.some((t) => t.by === 'fallback'), '补齐步骤要标记来源');

  delete process.env.AGENT_PLANNER;
  agent.__setTransport(null);
});

test('LLM 模式：模型给出未知工具名不崩溃，且最终能产出方案', async () => {
  const script = [
    { content: '试试', tool_calls: [call('nonexistent_tool', { foo: 1 })] },
    { content: '换一个', tool_calls: [call('search_heritage', { query: '豫剧' })] },
    { content: '完成', tool_calls: [] },
  ];
  let i = 0;
  agent.__setTransport(async () => script[Math.min(i++, script.length - 1)]);

  process.env.AGENT_PLANNER = 'llm';
  const r = await agent.run('给豫剧做视觉');
  assert.strictEqual(r.ok, true);
  assert.ok(r.trace[0].observation.includes('工具不存在'), '未知工具应有明确说明');
  assert.ok(r.proposal && r.proposal.title);

  delete process.env.AGENT_PLANNER;
  agent.__setTransport(null);
});

test('LLM 抛错时自动回落规则模式（演示不中断）', async () => {
  agent.__setTransport(async () => {
    throw new Error('模拟网络失败');
  });
  process.env.AGENT_PLANNER = 'llm';
  const r = await agent.run('帮我把钧瓷做成文创');
  assert.strictEqual(r.ok, true, '回落规则模式后仍然成功');
  assert.strictEqual(r.meta.planner, 'rules', '应标记为规则模式');
  assert.ok(r.proposal && r.proposal.title);

  delete process.env.AGENT_PLANNER;
  agent.__setTransport(null);
});
