// routes/upload.js —— 零依赖文件上传（base64 直传，省掉 multer）
// 前端把 FileReader 读出的 dataURL 直接 POST 过来即可，比 multipart 更省事，
// 也避免为了一个上传功能再引一个中间件依赖。
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { ok, AppError } = require('../utils/response');
const { validate } = require('../utils/validate');
const { asyncHandler } = require('../middleware/error');
const { authenticateToken } = require('../middleware/auth');
const { shortToken } = require('../utils/id');

const router = express.Router();

const ALLOWED = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
};

/**
 * POST /api/upload
 * body: { filename?: string, dataUrl: "data:image/png;base64,..." }
 * 返回: { url: "/uploads/xxx.png", size }
 */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const body = validate(req, {
      dataUrl: { required: true, type: 'string', label: '文件内容' },
      filename: { type: 'string', max: 100 },
    });

    const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(body.dataUrl);
    if (!m) throw AppError.param('文件格式不正确，需要 dataURL');

    const mime = m[1];
    const ext = ALLOWED[mime];
    if (!ext) throw AppError.param(`不支持的文件类型：${mime}`);

    const buf = Buffer.from(m[2], 'base64');
    if (buf.length === 0) throw AppError.param('文件内容为空');
    if (buf.length > config.uploadMaxBytes) {
      throw AppError.param(`文件超过大小限制（${Math.round(config.uploadMaxBytes / 1024 / 1024)} MB）`);
    }

    if (!fs.existsSync(config.uploadDir)) fs.mkdirSync(config.uploadDir, { recursive: true });

    const name = `${Date.now().toString(36)}_${shortToken(8)}${ext}`;
    fs.writeFileSync(path.join(config.uploadDir, name), buf);

    return ok(res, { url: `/uploads/${name}`, size: buf.length, mime }, '上传成功');
  })
);

module.exports = router;
