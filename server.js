const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ========== 目录初始化 ==========
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ========== 中间件 ==========
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// ========== 文件上传配置 ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只能上传图片'));
  }
});

// ========== 数据库初始化 ==========
const db = new Database(path.join(dataDir, 'xiaojilu.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- 家庭表
  CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    password TEXT NOT NULL UNIQUE,
    baby_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  -- 时间点记录
  CREATE TABLE IF NOT EXISTS instant_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL DEFAULT 0,
    event_type TEXT NOT NULL,
    event_label TEXT NOT NULL,
    recorded_by TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  -- 持续时间记录
  CREATE TABLE IF NOT EXISTS duration_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL DEFAULT 0,
    event_type TEXT NOT NULL,
    event_label TEXT NOT NULL,
    started_by TEXT NOT NULL,
    ended_by TEXT DEFAULT '',
    started_at TEXT NOT NULL,
    ended_at TEXT DEFAULT '',
    duration_minutes REAL DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  -- 图片表
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    record_type TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// ========== 数据库迁移 ==========
try {
  const cols = db.prepare("PRAGMA table_info(instant_records)").all();
  if (!cols.find(c => c.name === 'family_id')) {
    db.exec('ALTER TABLE instant_records ADD COLUMN family_id INTEGER NOT NULL DEFAULT 0');
  }
} catch (e) { /* 列已存在 */ }

try {
  const cols = db.prepare("PRAGMA table_info(duration_records)").all();
  if (!cols.find(c => c.name === 'family_id')) {
    db.exec('ALTER TABLE duration_records ADD COLUMN family_id INTEGER NOT NULL DEFAULT 0');
  }
} catch (e) { /* 列已存在 */ }

// 迁移旧数据：确保默认密码对应的家庭存在
const OLD_PASSWORD = process.env.PASSWORD || 'baobao2024';
const existingFamily = db.prepare('SELECT id FROM families WHERE password = ?').get(OLD_PASSWORD);
if (!existingFamily) {
  db.prepare('INSERT INTO families (password, baby_name) VALUES (?, ?)').run(OLD_PASSWORD, '');
  const newFamily = db.prepare('SELECT id FROM families WHERE password = ?').get(OLD_PASSWORD);
  db.prepare('UPDATE instant_records SET family_id = ? WHERE family_id = 0').run(newFamily.id);
  db.prepare('UPDATE duration_records SET family_id = ? WHERE family_id = 0').run(newFamily.id);
}

// ========== 认证中间件 ==========
function auth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: '未提供密码' });
  const family = db.prepare('SELECT id, baby_name FROM families WHERE password = ?').get(token);
  if (!family) return res.status(401).json({ error: '密码错误' });
  req.familyId = family.id;
  req.babyName = family.baby_name;
  next();
}

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_PASSWORD) return res.status(401).json({ error: '管理员密码错误' });
  next();
}

// ========== 家庭密码验证 ==========
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  const family = db.prepare('SELECT id, baby_name FROM families WHERE password = ?').get(password);
  if (family) {
    res.json({ success: true, token: password, familyId: family.id, babyName: family.baby_name });
  } else {
    res.status(401).json({ success: false, error: '密码错误' });
  }
});

// ========== Admin API ==========
app.post('/api/admin/auth', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: '管理员密码错误' });
  }
});

app.get('/api/admin/families', adminAuth, (req, res) => {
  const families = db.prepare('SELECT * FROM families ORDER BY created_at DESC').all();
  const result = families.map(f => {
    const instantCount = db.prepare('SELECT COUNT(*) as c FROM instant_records WHERE family_id = ?').get(f.id).c;
    const durationCount = db.prepare('SELECT COUNT(*) as c FROM duration_records WHERE family_id = ?').get(f.id).c;
    return { ...f, instantCount, durationCount };
  });
  res.json(result);
});

app.post('/api/admin/families', adminAuth, (req, res) => {
  const { password, baby_name } = req.body;
  if (!password || password.trim().length === 0) return res.status(400).json({ error: '密码不能为空' });
  const existing = db.prepare('SELECT id FROM families WHERE password = ?').get(password.trim());
  if (existing) return res.status(400).json({ error: '该密码已被使用' });
  const result = db.prepare('INSERT INTO families (password, baby_name) VALUES (?, ?)').run(password.trim(), baby_name || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/admin/families/:id', adminAuth, (req, res) => {
  const { password, baby_name } = req.body;
  const sets = [];
  const params = [];
  if (password !== undefined) {
    const existing = db.prepare('SELECT id FROM families WHERE password = ? AND id != ?').get(password.trim(), req.params.id);
    if (existing) return res.status(400).json({ error: '该密码已被使用' });
    sets.push('password = ?'); params.push(password.trim());
  }
  if (baby_name !== undefined) { sets.push('baby_name = ?'); params.push(baby_name); }
  if (sets.length === 0) return res.status(400).json({ error: '没有要修改的内容' });
  params.push(req.params.id);
  db.prepare(`UPDATE families SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

app.delete('/api/admin/families/:id', adminAuth, (req, res) => {
  const familyId = req.params.id;
  const imgs = db.prepare('SELECT filename FROM images WHERE family_id = ?').all(familyId);
  imgs.forEach(img => {
    const filePath = path.join(uploadsDir, img.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  db.prepare('DELETE FROM images WHERE family_id = ?').run(familyId);
  db.prepare('DELETE FROM instant_records WHERE family_id = ?').run(familyId);
  db.prepare('DELETE FROM duration_records WHERE family_id = ?').run(familyId);
  db.prepare('DELETE FROM families WHERE id = ?').run(familyId);
  res.json({ success: true });
});

// ========== 时间点记录 API ==========

app.post('/api/instant', auth, (req, res) => {
  const { event_type, event_label, recorded_by, recorded_at, note } = req.body;
  const stmt = db.prepare(`
    INSERT INTO instant_records (family_id, event_type, event_label, recorded_by, recorded_at, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(req.familyId, event_type, event_label, recorded_by, recorded_at || new Date().toISOString(), note || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/instant', auth, (req, res) => {
  const { event_type, limit = 50 } = req.query;
  let sql = 'SELECT * FROM instant_records WHERE family_id = ?';
  const params = [req.familyId];
  if (event_type) { sql += ' AND event_type = ?'; params.push(event_type); }
  sql += ' ORDER BY recorded_at DESC LIMIT ?';
  params.push(Number(limit));
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.delete('/api/instant/:id', auth, (req, res) => {
  const imgs = db.prepare('SELECT filename FROM images WHERE record_type = ? AND record_id = ? AND family_id = ?').all('instant', req.params.id, req.familyId);
  imgs.forEach(img => {
    const filePath = path.join(uploadsDir, img.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  db.prepare('DELETE FROM images WHERE record_type = ? AND record_id = ? AND family_id = ?').run('instant', req.params.id, req.familyId);
  db.prepare('DELETE FROM instant_records WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.json({ success: true });
});

// ========== 持续时间记录 API ==========

app.post('/api/duration/start', auth, (req, res) => {
  const { event_type, event_label, started_by, started_at, note } = req.body;
  const stmt = db.prepare(`
    INSERT INTO duration_records (family_id, event_type, event_label, started_by, started_at, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(req.familyId, event_type, event_label, started_by, started_at || new Date().toISOString(), note || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

app.post('/api/duration/end/:id', auth, (req, res) => {
  const { ended_by, ended_at } = req.body;
  const endTime = ended_at || new Date().toISOString();
  const record = db.prepare('SELECT * FROM duration_records WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!record) return res.status(404).json({ error: '记录不存在' });
  if (record.ended_at) return res.status(400).json({ error: '该事件已经结束' });
  const startTime = new Date(record.started_at);
  const endTimeObj = new Date(endTime);
  const durationMinutes = (endTimeObj - startTime) / 1000 / 60;
  db.prepare('UPDATE duration_records SET ended_by = ?, ended_at = ?, duration_minutes = ? WHERE id = ?')
    .run(ended_by, endTime, Math.round(durationMinutes * 10) / 10, req.params.id);
  res.json({ success: true, duration_minutes: Math.round(durationMinutes * 10) / 10 });
});

app.put('/api/duration/:id', auth, (req, res) => {
  const { event_type, event_label, note } = req.body;
  const sets = [];
  const params = [];
  if (event_type !== undefined) { sets.push('event_type = ?'); params.push(event_type); }
  if (event_label !== undefined) { sets.push('event_label = ?'); params.push(event_label); }
  if (note !== undefined) { sets.push('note = ?'); params.push(note); }
  if (sets.length === 0) return res.status(400).json({ error: '没有要修改的内容' });
  params.push(req.params.id, req.familyId);
  db.prepare(`UPDATE duration_records SET ${sets.join(', ')} WHERE id = ? AND family_id = ?`).run(...params);
  res.json({ success: true });
});

app.get('/api/duration', auth, (req, res) => {
  const { event_type, active_only, limit = 50 } = req.query;
  let sql = 'SELECT * FROM duration_records WHERE family_id = ?';
  const params = [req.familyId];
  if (event_type) { sql += ' AND event_type = ?'; params.push(event_type); }
  if (active_only === 'true') sql += " AND (ended_at = '' OR ended_at IS NULL)";
  sql += ' ORDER BY started_at DESC LIMIT ?';
  params.push(Number(limit));
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.delete('/api/duration/:id', auth, (req, res) => {
  const imgs = db.prepare('SELECT filename FROM images WHERE record_type = ? AND record_id = ? AND family_id = ?').all('duration', req.params.id, req.familyId);
  imgs.forEach(img => {
    const filePath = path.join(uploadsDir, img.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  db.prepare('DELETE FROM images WHERE record_type = ? AND record_id = ? AND family_id = ?').run('duration', req.params.id, req.familyId);
  db.prepare('DELETE FROM duration_records WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.json({ success: true });
});

// ========== 进行中事件 ==========
app.get('/api/active', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM duration_records 
    WHERE family_id = ? AND (ended_at = '' OR ended_at IS NULL) 
    ORDER BY started_at DESC
  `).all(req.familyId);
  res.json(rows);
});

// ========== 最近 N 天记录 ==========
app.get('/api/recent', auth, (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 10, 1), 30);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days + 1);
  const startStr = startDate.getFullYear() + '-' +
    String(startDate.getMonth() + 1).padStart(2, '0') + '-' +
    String(startDate.getDate()).padStart(2, '0');

  const instants = db.prepare(`
    SELECT * FROM instant_records 
    WHERE family_id = ? AND recorded_at >= ? 
    ORDER BY recorded_at DESC
  `).all(req.familyId, startStr);

  const durations = db.prepare(`
    SELECT * FROM duration_records 
    WHERE family_id = ? AND started_at >= ? 
    ORDER BY started_at DESC
  `).all(req.familyId, startStr);

  const attachImages = (records, type) => {
    return records.map(r => {
      const imgs = db.prepare('SELECT id, filename FROM images WHERE record_type = ? AND record_id = ? AND family_id = ?')
        .all(type, r.id, req.familyId);
      return { ...r, images: imgs.map(i => ({ id: i.id, url: `/uploads/${i.filename}` })) };
    });
  };

  res.json({
    instants: attachImages(instants, 'instant'),
    durations: attachImages(durations, 'duration'),
    days
  });
});

// 兼容旧接口
app.get('/api/today', auth, (req, res) => {
  const today = new Date();
  const todayStr = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');
  const instants = db.prepare('SELECT * FROM instant_records WHERE family_id = ? AND recorded_at >= ? ORDER BY recorded_at DESC').all(req.familyId, todayStr);
  const durations = db.prepare('SELECT * FROM duration_records WHERE family_id = ? AND started_at >= ? ORDER BY started_at DESC').all(req.familyId, todayStr);
  res.json({ instants, durations });
});

// ========== 图片上传 ==========
app.post('/api/upload', auth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有上传文件' });
  const { record_type, record_id } = req.body;
  if (!record_type || !record_id) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: '缺少 record_type 或 record_id' });
  }
  const stmt = db.prepare('INSERT INTO images (family_id, record_type, record_id, filename) VALUES (?, ?, ?, ?)');
  const result = stmt.run(req.familyId, record_type, Number(record_id), req.file.filename);
  res.json({ success: true, id: result.lastInsertRowid, url: `/uploads/${req.file.filename}` });
});

app.delete('/api/images/:id', auth, (req, res) => {
  const img = db.prepare('SELECT * FROM images WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!img) return res.status(404).json({ error: '图片不存在' });
  const filePath = path.join(uploadsDir, img.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/images/:record_type/:record_id', auth, (req, res) => {
  const imgs = db.prepare('SELECT id, filename FROM images WHERE record_type = ? AND record_id = ? AND family_id = ?')
    .all(req.params.record_type, req.params.record_id, req.familyId);
  res.json(imgs.map(i => ({ id: i.id, url: `/uploads/${i.filename}` })));
});

// ========== SPA fallback ==========
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== 启动服务 ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log(`小记录服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`管理员密码: ${ADMIN_PASSWORD}`);
  const families = db.prepare('SELECT COUNT(*) as c FROM families').get();
  console.log(`已注册家庭数: ${families.c}`);
});
