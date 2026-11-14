# Dockerfile —— 生产镜像（前后端同源，一个容器搞定）
# 构建：docker build -f deploy/Dockerfile -t ich-platform:2.1 .
# 运行：docker run -d -p 3000:3000 -e NODE_ENV=production -e JWT_SECRET=<随机串> ich-platform:2.1
FROM node:20-alpine

# better-sqlite3 需要编译工具链
RUN apk add --no-cache python3 make g++

WORKDIR /app/backend

# 先装依赖，利用镜像层缓存
COPY backend/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 再拷代码（前端也一起进镜像，由 Node 直接托管）
COPY backend ./
COPY 算法网站(3) ../算法网站(3)
COPY launcher.js ../launcher.js

# 数据目录（SQLite 在这里）
ENV DATABASE_PATH=/app/backend/data/database.sqlite \
    NODE_ENV=production \
    AUTO_OPEN_BROWSER=0 \
    AUTO_SETUP=1 \
    PORT=3000

RUN mkdir -p /app/backend/data /app/backend/uploads
VOLUME ["/app/backend/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
