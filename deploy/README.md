# 部署说明（对应提交要求里的"在线演示，可选加分项"）

本项目是 **Node.js + SQLite**，没有 GPU 依赖，**一台 1C1G 的免费实例就能跑**。
下面给两种最常见的方式，二选一即可。

---

## 方式 A：Render（免费，推荐）

1. 把仓库推到 GitHub（`.env` 已在 `.gitignore` 里，不会被提交）。
2. 打开 <https://render.com> → New → **Web Service** → 选中这个仓库。
3. 按下面填：

| 配置项 | 值 |
|---|---|
| Runtime | Node |
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | Free |

4. 在 **Environment** 里加环境变量：

```
NODE_ENV=production
JWT_SECRET=<32 位以上随机串>
AUTO_OPEN_BROWSER=0
AUTO_SETUP=1
# 可选：QWEN_API_KEY=sk-xxx
```

5. 部署完成后访问 `https://<你的服务>.onrender.com/` —— 首页直接可看，
   首次启动会自动灌入非遗数据（`AUTO_SETUP=1`）。
6. 在线演示地址与体验账号写进 README 和提交材料。

> 也可以直接用仓库里的 `deploy/render.yaml`（Render 的 Blueprint 部署，一键导入）。

**注意**：免费实例 15 分钟无访问会休眠，首次访问需等 30-60 秒唤醒。
评审期建议用 UptimeRobot 之类的免费监控每 10 分钟探活一次。

---

## 方式 B：Docker（任意云主机 / 宝塔 / 阿里云 ECS）

```bash
# 在项目根目录执行
docker build -f deploy/Dockerfile -t ich-platform:2.1 .
docker run -d --name ich -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e AUTO_OPEN_BROWSER=0 \
  -v $(pwd)/data:/app/backend/data \
  ich-platform:2.1
```

- 镜像里只装生产依赖，前端静态文件由同一个 Node 服务托管，**前后端同源**，无需再配 Nginx 反代（要配也可以，见下）。
- `-v .../data:/app/backend/data` 把 SQLite 挂出来，容器重建不丢数据。

### Nginx 反向代理（可选）

```nginx
server {
  listen 80;
  server_name ich.example.com;

  # SSE 流式接口不能缓冲
  location /api/ai/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

> 关键点：`/api/ai/**` 必须 `proxy_buffering off`，否则流式输出会被 Nginx 攒成一整块再返回，演示时看不到"逐字出现"。

---

## 上线后自检（30 秒）

| 检查 | 期望 |
|---|---|
| `GET /health` | `{"status":"ok"}` |
| 打开 `/` | 自动跳到首页，且**导航右上角没有"离线演示"小标识** |
| `/api/content/heritage` | 返回 49 个项目（不是空数组） |
| `/html/ai-chat.html` 提问 | 文字逐字出现，回答下方有"依据" |
| `/html/ai-lab.html` → Agent | 5 步工具调用能跑完 |
| `GET /api/mcp` | 返回 MCP 服务信息 |

如果 `/api/content/heritage` 返回空：说明没灌数据，设置 `AUTO_SETUP=1` 重启，或进容器执行 `npm run setup`。
