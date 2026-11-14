// tests/auth.test.js —— 注册 / 登录（含"用邮箱登录"与冲突提示）
// 运行：cd backend && npm test （需要数据库已初始化）
const test = require('node:test');
const assert = require('node:assert');

const { authService } = require('../services/auth.service');
const { userRepo } = require('../repositories/user.repo');

const stamp = Date.now().toString().slice(-6);
const tmp = {
  username: 't_' + stamp,
  email: 't' + stamp + '@test.local',
  password: '123456',
};

test('注册 → 用用户名登录 → 用邮箱登录（大小写不敏感）', async () => {
  const created = await authService.register({ ...tmp });
  assert.strictEqual(created.user.username, tmp.username);
  assert.ok(created.token);

  const byName = await authService.login({ username: tmp.username, password: tmp.password });
  assert.strictEqual(byName.user.id, created.user.id);

  const byMail = await authService.login({ username: tmp.email.toUpperCase(), password: tmp.password });
  assert.strictEqual(byMail.user.id, created.user.id, '邮箱大写也能登录');

  userRepo.remove(created.user.id); // 清理测试数据
});

test('邮箱重复注册：明确点名是邮箱冲突，并给出打码的已有账号', async () => {
  const admin = userRepo.findByUsername('admin');
  await assert.rejects(
    () => authService.register({ username: 'x' + stamp + '_1', email: admin.email, password: '123456' }),
    (err) => {
      assert.strictEqual(err.httpStatus, 409);
      assert.ok(err.message.includes('邮箱'), '消息要说明是邮箱问题：' + err.message);
      assert.deepStrictEqual(err.details.fields, ['email']);
      assert.ok(String(err.details.existingUsername).includes('****'), '已有账号应打码');
      return true;
    }
  );
});

test('用户名重复注册：提示换用户名，并给出可用建议', async () => {
  await assert.rejects(
    () => authService.register({ username: 'admin', email: 'brand' + stamp + '@test.local', password: '123456' }),
    (err) => {
      assert.strictEqual(err.httpStatus, 409);
      assert.ok(err.message.includes('用户名'));
      assert.deepStrictEqual(err.details.fields, ['username']);
      assert.ok(err.details.suggestion && err.details.suggestion.startsWith('admin_'));
      return true;
    }
  );
});

test('密码错误：401 且提示可以用邮箱登录', async () => {
  await assert.rejects(
    () => authService.login({ username: 'admin', password: 'definitely-wrong' }),
    (err) => {
      assert.strictEqual(err.httpStatus, 401);
      assert.ok(err.message.includes('账号或密码错误'));
      assert.ok(err.message.includes('邮箱'), '要提示"用户名和邮箱都可以登录"');
      return true;
    }
  );
});

test('不存在的账号：同样返回 401（不暴露账号是否存在）', async () => {
  await assert.rejects(
    () => authService.login({ username: 'no_such_user_' + stamp, password: '123456' }),
    (err) => {
      assert.strictEqual(err.httpStatus, 401);
      return true;
    }
  );
});

test('可用性检查：新用户名/邮箱都可用；已存在则标记 taken', () => {
  const fresh = authService.checkAvailability({ username: 'fresh_' + stamp, email: 'fresh' + stamp + '@test.local' });
  assert.strictEqual(fresh.username.taken, false);
  assert.strictEqual(fresh.email.taken, false);
  assert.ok(fresh.username.suggestion === null);

  const taken = authService.checkAvailability({ username: 'admin', email: 'admin@ich.local' });
  assert.strictEqual(taken.username.taken, true);
  assert.strictEqual(taken.email.taken, true);
  assert.ok(taken.email.existingUsername.includes('****'));
});
