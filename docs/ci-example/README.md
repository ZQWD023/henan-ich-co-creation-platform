# CI / 保活配置（放在这里的原因，以及怎么启用）

## 为什么不在 `.github/workflows/`

推送时 GitHub 报了这么一条：

```
! [remote rejected] main -> main
  (refusing to allow an OAuth App to create or update workflow
   `.github/workflows/ci.yml` without `workflow` scope)
```

意思是：当前的 Git 凭据（OAuth token）只有 `repo` / `gist` / `read:org` 权限，
**没有 `workflow` 权限**，所以不能往仓库里推 `.github/workflows/*.yml`。

这不是代码问题，是**推送凭据的权限问题**。为了不让评审缺内容，两个工作流放在了这里（`docs/ci-example/`），
内容与正式位置完全一致，评审可以直接看到我们的 CI 与保活方案。

## 怎么启用（1 分钟，需要你在本机执行）

```bash
# 1. 给凭据补上 workflow 权限（会打开浏览器确认一次）
gh auth refresh -s workflow

# 2. 把配置复制回正式位置
mkdir -p .github/workflows
cp docs/ci-example/ci.yml .github/workflows/ci.yml
cp docs/ci-example/keepalive.yml .github/workflows/keepalive.yml

# 3. 提交并推送
git add .github/workflows
git commit -m "ci: 启用 GitHub Actions（lint/typecheck/test + 演示保活）"
git push
```

启用后：
- **CI**：每次 push 自动跑 ESLint / Prettier / tsc / 30 个单测 / RAG 评测，并上传评测报告为 artifact；
- **保活**：每 10 分钟 ping 一次在线演示，防止 Render 免费实例休眠。
  需要在仓库 **Settings → Secrets and variables → Actions → Variables** 里加一条：
  `DEMO_URL = https://你的演示地址`。

> 提示：如果暂时不想动权限，也可以**完全不用这两个文件** —— 它们只是"锦上添花"，
> 不影响作品本身（本地 `npm run verify` 已经覆盖了同样的检查）。
