// tests/rag.test.js —— 检索增强（BM25）单元测试
// 运行：cd backend && npm test   （需要先有数据库数据：首次 npm start 会自动灌入）
const test = require('node:test');
const assert = require('node:assert');

const { retrieve, getIndex, tokenize } = require('../services/rag.service');

test('知识库索引可构建，且片段数量充足', () => {
  const idx = getIndex();
  assert.ok(idx.N > 300, `片段数应大于 300，实际 ${idx.N}`);
  assert.ok(idx.avgLen > 10);
});

test('中文切词：CJK 取 bigram，英文按词', () => {
  const t = tokenize('钧瓷的窑变 kiln');
  assert.ok(t.includes('钧瓷'));
  assert.ok(t.includes('窑变'));
  assert.ok(t.includes('kiln'));
  assert.ok(!t.includes('的'), '停用词应被过滤');
});

test('问"钧瓷的窑变"应首选钧瓷项目', () => {
  const hits = retrieve('什么是钧瓷的窑变？');
  assert.ok(hits.length > 0);
  assert.strictEqual(hits[0].heritageId, 'junci');
  assert.ok(hits[0].similarity > 0.9);
});

test('问"河南有哪些戏曲"应命中多个传统戏剧项目（分类意图加权）', () => {
  const hits = retrieve('河南有哪些戏曲', { k: 6 });
  const drama = new Set(hits.filter((h) => h.category === '传统戏剧').map((h) => h.heritageId));
  assert.ok(drama.size >= 2, `应至少命中 2 个戏剧项目，实际 ${[...drama].join(',')}`);
});

test('返回条数不超过 k', () => {
  const hits = retrieve('豫剧 唱腔 花木兰 穆桂英 常香玉', { k: 2 });
  assert.ok(hits.length <= 2);
});

test('结果按相关度降序', () => {
  const hits = retrieve('汴绣 双面绣', { k: 5 });
  for (let i = 1; i < hits.length; i++) {
    assert.ok(hits[i].score <= hits[i - 1].score + 1e-9, '分数应单调不增');
  }
});

test('无关问题不硬凑依据（阈值生效）', () => {
  const hits = retrieve('今天天气怎么样', { k: 4 });
  assert.strictEqual(hits.length, 0);
});
