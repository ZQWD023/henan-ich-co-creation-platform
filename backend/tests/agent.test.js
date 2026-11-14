// tests/agent.test.js —— 共创 Agent 端到端测试（真实调用 5 个工具，pace=0 关闭演示停顿）
const test = require('node:test');
const assert = require('node:assert');

const agent = require('../services/agent.service');

test('工具清单是合法 JSON Schema', () => {
  assert.strictEqual(agent.TOOLS.length, 5);
  for (const t of agent.TOOLS) {
    assert.ok(t.name && t.description);
    assert.strictEqual(t.parameters.type, 'object');
    assert.ok(Array.isArray(t.parameters.required));
    for (const key of t.parameters.required) {
      assert.ok(t.parameters.properties[key], `${t.name} 缺少参数定义 ${key}`);
    }
  }
});

test('目标"钧瓷文创"能被正确识别并产出完整方案', async () => {
  const r = await agent.run('帮我把钧瓷做成一套文创产品', { pace: 0 });
  assert.strictEqual(r.ok, true, '应执行成功');
  assert.strictEqual(r.heritage.id, 'junci', '应锁定钧瓷项目');
  assert.strictEqual(r.trace.length, 5, '应完整走完 5 个工具');
  assert.deepStrictEqual(
    r.trace.map((s) => s.tool),
    ['search_heritage', 'get_heritage_detail', 'list_related_works', 'suggest_tasks', 'draft_project_brief']
  );
  assert.ok(r.tasks.length >= 3, '任务拆解至少 3 项');
  assert.ok(r.tasks.every((t) => t.title && t.role && t.estimateDays > 0));
  assert.ok(r.proposal.title.length >= 4 && r.proposal.title.length <= 60, '标题需满足后端校验 4-60 字');
  assert.ok(r.proposal.description.length > 20);
  assert.ok(r.proposal.heritageId === 'junci');
});

test('创作角度能按目标自动切换', async () => {
  const short = await agent.run('给汴绣做一条短视频传播计划', { pace: 0 });
  assert.strictEqual(short.proposal.angle, '内容传播');
  assert.ok(short.proposal.title.includes('传播') || short.proposal.title.includes('数字'));

  const offline = await agent.run('做一个豫剧的线下体验工作坊', { pace: 0 });
  assert.strictEqual(offline.proposal.angle, '线下体验');
});

test('无法匹配时给出友好提示而不是崩溃', async () => {
  const r = await agent.run('完全不相干的一串词 zzzzz', { pace: 0 });
  assert.strictEqual(r.ok, false);
  assert.ok(r.message.length > 5);
  assert.ok(Array.isArray(r.trace));
});

test('每一步都有可展示的轨迹字段', async () => {
  const r = await agent.run('少林功夫能做成什么文创', { pace: 0 });
  for (const step of r.trace) {
    assert.ok(step.index >= 1);
    assert.ok(step.thought && step.thought.length > 4);
    assert.ok(step.tool && step.toolTitle);
    assert.ok(step.observation && step.observation.length > 2);
    assert.ok(typeof step.durationMs === 'number');
  }
});
