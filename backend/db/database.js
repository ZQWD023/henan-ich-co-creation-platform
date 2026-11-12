// db/database.js —— 全量建表（幂等，可反复执行）
// 设计要点：
//   1. 所有主键用 TEXT（带前缀的业务 ID），便于日志追踪与前后端联调
//   2. 所有状态字段用 TEXT + 代码层枚举校验，不用 MySQL 的 ENUM，方便迁移
//   3. 所有外键都声明 ON DELETE 行为，避免脏数据
//   4. 高频查询字段建索引（状态、外键、时间）
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const dbPath = config.dbPath;
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL'); // 并发读写更稳，部署到服务器也不会锁死

const NOW = "datetime('now','localtime')";

const SCHEMA = `
-- ============ 1. 用户与权限 ============
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  avatar        TEXT,
  bio           TEXT DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'user',      -- user | creator | admin
  cert_status   TEXT NOT NULL DEFAULT 'none',      -- none | pending | approved | rejected
  status        TEXT NOT NULL DEFAULT 'active',    -- active | banned
  last_login_at DATETIME,
  joined_date   TEXT NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_cert   ON users(cert_status);

-- 传承人认证申请（独立成表，保留审核轨迹，可多次申请）
CREATE TABLE IF NOT EXISTS user_certification (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  real_name    TEXT NOT NULL,
  heritage_id  TEXT,
  level        TEXT,                                -- 国家级 / 省级 / 市级 / 县级
  title        TEXT,
  intro        TEXT,
  material_url TEXT,                                -- 资质材料（图片/PDF）
  status       TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | rejected
  review_note  TEXT,
  reviewer_id  TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at  DATETIME,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_cert_user   ON user_certification(user_id);
CREATE INDEX IF NOT EXISTS idx_cert_status ON user_certification(status);

-- ============ 2. 非遗内容资源库 ============
CREATE TABLE IF NOT EXISTS category (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,
  color       TEXT,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS heritage (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category_id TEXT NOT NULL,
  level       TEXT,                                  -- 国家级 / 省级 / 市级 / 县级
  region      TEXT,
  year        INTEGER,                               -- 入选年份
  icon        TEXT,
  gradient    TEXT,
  brief       TEXT,                                  -- 一句话简介
  intro       TEXT,
  history     TEXT,                                  -- 历史渊源
  lineage     TEXT,                                  -- 传承谱系
  features    TEXT,                                  -- JSON 数组
  steps       TEXT,                                  -- JSON 数组（工艺流程）
  visit       TEXT,                                  -- 体验与参观
  tags        TEXT,                                  -- JSON 数组
  popularity  INTEGER DEFAULT 0,
  likes       INTEGER DEFAULT 0,
  cover_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'published',     -- published | offline
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES category(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_heritage_cat    ON heritage(category_id);
CREATE INDEX IF NOT EXISTS idx_heritage_region ON heritage(region);
CREATE INDEX IF NOT EXISTS idx_heritage_level  ON heritage(level);
CREATE INDEX IF NOT EXISTS idx_heritage_pop    ON heritage(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_heritage_name   ON heritage(name);

CREATE TABLE IF NOT EXISTS inheritor (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  gender      TEXT,
  level       TEXT,
  heritage_id TEXT,
  user_id     TEXT,                                  -- 若已绑定平台账号
  title       TEXT,
  region      TEXT,
  years       INTEGER,
  bio         TEXT,
  icon        TEXT,
  avatar_url  TEXT,
  status      TEXT NOT NULL DEFAULT 'published',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (heritage_id) REFERENCES heritage(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_inheritor_heritage ON inheritor(heritage_id);

-- 公共素材库（纹样、音效、参考资料）
CREATE TABLE IF NOT EXISTS material (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  heritage_id TEXT,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'pattern',       -- pattern 纹样 | audio 音效 | doc 资料
  file_url    TEXT NOT NULL,
  cover_url   TEXT,
  size_bytes  INTEGER DEFAULT 0,
  downloads   INTEGER DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'published',     -- published | offline
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (heritage_id) REFERENCES heritage(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_material_type ON material(type);

-- ============ 3. 作品 ============
CREATE TABLE IF NOT EXISTS work (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  heritage_id  TEXT,                                 -- 关联非遗项目
  project_id   TEXT,                                 -- 若来自共创项目
  title        TEXT NOT NULL,
  work_type    TEXT,                                 -- 产品设计 / 视觉设计 / IP设计 ...
  summary      TEXT,                                 -- 卡片描述
  content      TEXT,                                 -- 正文（可选）
  cover_url    TEXT,
  file_url     TEXT,
  tags         TEXT,                                 -- JSON 数组
  status       TEXT NOT NULL DEFAULT 'pending',      -- draft | pending | approved | rejected | offline
  audit_note   TEXT,
  views_count  INTEGER DEFAULT 0,
  likes_count  INTEGER DEFAULT 0,
  favorites_count INTEGER DEFAULT 0,
  comments_count  INTEGER DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (heritage_id) REFERENCES heritage(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_work_user   ON work(user_id);
CREATE INDEX IF NOT EXISTS idx_work_status ON work(status);
CREATE INDEX IF NOT EXISTS idx_work_heri   ON work(heritage_id);
CREATE INDEX IF NOT EXISTS idx_work_proj   ON work(project_id);
CREATE INDEX IF NOT EXISTS idx_work_time   ON work(created_at DESC);

-- ============ 4. 共创协作（平台核心） ============
CREATE TABLE IF NOT EXISTS co_project (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL,
  heritage_id   TEXT,
  title         TEXT NOT NULL,
  cover_url     TEXT,
  description   TEXT,
  recruit_need  TEXT,                                -- 招募要求
  member_limit  INTEGER DEFAULT 10,
  deadline      DATETIME,
  status        TEXT NOT NULL DEFAULT 'draft',       -- draft|recruiting|in_progress|reviewing|closed|cancelled
  views_count   INTEGER DEFAULT 0,
  members_count INTEGER DEFAULT 0,
  is_featured   INTEGER DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at     DATETIME,
  FOREIGN KEY (owner_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (heritage_id) REFERENCES heritage(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_proj_owner  ON co_project(owner_id);
CREATE INDEX IF NOT EXISTS idx_proj_status ON co_project(status);
CREATE INDEX IF NOT EXISTS idx_proj_heri   ON co_project(heritage_id);
CREATE INDEX IF NOT EXISTS idx_proj_time   ON co_project(created_at DESC);

CREATE TABLE IF NOT EXISTS co_member (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  role         TEXT DEFAULT '设计',                   -- 设计 / 文案 / 制作 / 统筹
  apply_reason TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',       -- pending|approved|rejected|quit|removed
  reviewed_by  TEXT,
  joined_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at  DATETIME,
  FOREIGN KEY (project_id) REFERENCES co_project(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_member_proj ON co_member(project_id, status);
CREATE INDEX IF NOT EXISTS idx_member_user ON co_member(user_id);

CREATE TABLE IF NOT EXISTS co_task (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  assignee_id    TEXT,
  created_by     TEXT,
  deadline       DATETIME,
  status         TEXT NOT NULL DEFAULT 'todo',       -- todo|doing|review|done
  progress       INTEGER DEFAULT 0,                  -- 0-100
  submit_content TEXT,                               -- 阶段成果
  submit_url     TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id)  REFERENCES co_project(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_task_proj ON co_task(project_id);
CREATE INDEX IF NOT EXISTS idx_task_assignee ON co_task(assignee_id, status);

-- 成果版本（多版本留存 + 历史回溯）
CREATE TABLE IF NOT EXISTS co_version (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  version_no   INTEGER NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT,
  file_url     TEXT,
  cover_url    TEXT,
  submitter_id TEXT,
  is_final     INTEGER DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id)   REFERENCES co_project(id) ON DELETE CASCADE,
  FOREIGN KEY (submitter_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_version_proj ON co_version(project_id, version_no DESC);

-- 项目内讨论（支持 @ 与回复）
CREATE TABLE IF NOT EXISTS co_discussion (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  content    TEXT NOT NULL,
  reply_to   TEXT,
  mentions   TEXT,                                   -- JSON 数组，@ 到的用户 ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES co_project(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to)   REFERENCES co_discussion(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_disc_proj ON co_discussion(project_id, created_at DESC);

-- ============ 5. 社区互动 ============
-- 多态评论：target_type = work | project | heritage
CREATE TABLE IF NOT EXISTS comment (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  content     TEXT NOT NULL,
  parent_id   TEXT,
  likes_count INTEGER DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'visible',       -- visible | hidden | deleted
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES comment(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comment_target ON comment(target_type, target_id, status);
CREATE INDEX IF NOT EXISTS idx_comment_user   ON comment(user_id);

-- 点赞 / 收藏 / 关注 三合一（一张表覆盖所有互动，避免三套孪生表）
CREATE TABLE IF NOT EXISTS interaction (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  target_type TEXT NOT NULL,                         -- work|project|heritage|comment|user(关注)
  target_id   TEXT NOT NULL,
  action      TEXT NOT NULL,                         -- like|favorite|follow
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, target_type, target_id, action)
);
CREATE INDEX IF NOT EXISTS idx_inter_target ON interaction(target_type, target_id, action);
CREATE INDEX IF NOT EXISTS idx_inter_user   ON interaction(user_id, action);

CREATE TABLE IF NOT EXISTS topic (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  cover_url   TEXT,
  work_count  INTEGER DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_topic (
  work_id  TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  PRIMARY KEY (work_id, topic_id),
  FOREIGN KEY (work_id)  REFERENCES work(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topic(id) ON DELETE CASCADE
);

-- ============ 6. 消息通知 ============
CREATE TABLE IF NOT EXISTS notification (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  type        TEXT NOT NULL,      -- like|comment|follow|project_progress|audit|system
  title       TEXT NOT NULL,
  content     TEXT,
  target_type TEXT,
  target_id   TEXT,
  is_read     INTEGER DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_noti_user ON notification(user_id, is_read, created_at DESC);

-- ============ 7. 活动 / 资讯 / 成就 ============
CREATE TABLE IF NOT EXISTS event (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  type        TEXT,
  event_date  TEXT,
  location    TEXT,
  status      TEXT,
  description TEXT,
  icon        TEXT,
  cover_url   TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enrollment (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  event_id   TEXT NOT NULL,
  real_name  TEXT NOT NULL,
  phone      TEXT NOT NULL,
  notes      TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES event(id) ON DELETE CASCADE,
  UNIQUE (user_id, event_id)
);

CREATE TABLE IF NOT EXISTS news (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  news_date  TEXT,
  source     TEXT,
  category   TEXT,
  summary    TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS achievement (
  key_       TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  description TEXT,
  icon       TEXT,
  color      TEXT
);

CREATE TABLE IF NOT EXISTS user_achievement (
  user_id         TEXT NOT NULL,
  achievement_key TEXT NOT NULL,
  unlocked_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, achievement_key),
  FOREIGN KEY (user_id)         REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (achievement_key) REFERENCES achievement(key_) ON DELETE CASCADE
);

-- ============ 8. 审计日志（管理台所有敏感操作留痕） ============
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  note        TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id);
`;

function initDatabase() {
  db.exec(SCHEMA);
  return db;
}

module.exports = { db, initDatabase, NOW };
