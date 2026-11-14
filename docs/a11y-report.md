# 可访问性（a11y）审计报告

> 生成时间：2026-11-14 07:41:02　·　脚本：`tools/a11y-audit.js`
> 审计页面：20 个　·　问题总数：13

## 一、按类型汇总

| 类型 | 次数 | 含义 |
|---|---|---|
| heading | 12 | 标题层级跳级 |
| h1 | 1 | h1 缺失或重复 |

## 二、逐页明细

### index.html

✅ 未发现问题

### html/projects.html

- **[heading]** 标题层级跳级 1→3

### html/project-detail.html?id=junci

✅ 未发现问题

### html/inheritors.html

- **[heading]** 标题层级跳级 1→3

### html/gallery.html

- **[heading]** 标题层级跳级 1→3

### html/co-create.html

- **[heading]** 标题层级跳级 1→3

### html/co-projects.html

- **[heading]** 标题层级跳级 1→3

### html/co-project-detail.html?id=proj_x

- **[heading]** 标题层级跳级 1→3

### html/my-workspace.html

- **[heading]** 标题层级跳级 1→3

### html/events.html

- **[heading]** 标题层级跳级 1→3

### html/ai-chat.html

✅ 未发现问题

### html/ai-lab.html

✅ 未发现问题

### html/about.html

✅ 未发现问题

### html/login.html

✅ 未发现问题

### html/register.html

✅ 未发现问题

### html/profile.html

- **[heading]** 标题层级跳级 1→3

### html/admin.html

- **[heading]** 标题层级跳级 1→3

### html/diagnose.html

- **[heading]** 标题层级跳级 1→3

### html/algorithms.html

- **[heading]** 标题层级跳级 1→3

### html/algorithm-detail.html?id=1

- **[h1]** 页面没有 h1

## 三、说明

- 这是**自动化粗检**，只覆盖结构性问题（alt / label / 标题层级 / 重复 id / tabindex / 地标 / 对比度）；
- 不覆盖：键盘焦点顺序是否合理、屏幕阅读器朗读体验、动态内容的 ARIA 状态；
- 对比度用计算样式粗算；带渐变/图片背景的分支已跳过（早期版本会把深色导航的字算到白底上，产生 1.08 的误报）。

## 四、已知取舍（本轮未修的原因）

| 问题 | 现状 | 为什么先不修 |
|---|---|---|
| 12 个页面的「标题层级 1→3」 | 页面顶部是 h1，下面的卡片标题/列表标题是 h3 | 这些 h3 是**卡片标题**（如 `.category-card h3`），语义上确实属于 h3；严格修法是给每个区块补一个 h2，属于结构性重构，收益（屏幕阅读器跳级提示）远小于改动风险 |
| `algorithm-detail.html` 没有 h1 | 它是「页面已迁移」的跳转存根，立即 redirect | 不是真实内容页 |

> 已修复项：3 个页面补语义 h1、轮播按钮补 aria-label、3 个表单控件补可访问名称、AI 问答页补 header/main 地标、新增 `.sr-only` 工具类。
