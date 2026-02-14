const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.PASSWORD || 'baobao2024';

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== 数据库初始化 ==========
const db = new Database(path.join(__dirname, 'data', 'xiaojilu.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  -- 时间点记录（如换尿裤）
  CREATE TABLE IF NOT EXISTS instant_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,        -- 事件类型：diaper, feed, etc.
    event_label TEXT NOT NULL,       -- 显示名称：换尿裤, 喂奶
    recorded_by TEXT NOT NULL,       -- 记录人：爸爸/妈妈/奶奶
    recorded_at TEXT NOT NULL,       -- 记录时间 ISO 格式
    note TEXT DEFAULT '',            -- 备注
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  -- 持续时间记录（如晒太阳）
  CREATE TABLE IF NOT EXISTS duration_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,        -- 事件类型：sunbath, feed, etc.
    event_label TEXT NOT NULL,       -- 显示名称：晒太阳, 吃奶
    started_by TEXT NOT NULL,        -- 开始记录人
    ended_by TEXT DEFAULT '',        -- 结束记录人（任意家庭成员可结束）
    started_at TEXT NOT NULL,        -- 开始时间
    ended_at TEXT DEFAULT '',        -- 结束时间（空=进行中）
    duration_minutes REAL DEFAULT 0, -- 持续分钟数
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// ========== 认证中间件 ==========
function auth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (token !== PASSWORD) {
    return res.status(401).json({ error: '密码错误' });
  }
  next();
}

// ========== 密码验证 ==========
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === PASSWORD) {
    res.json({ success: true, token: PASSWORD });
  } else {
    res.status(401).json({ success: false, error: '密码错误' });
  }
});

// ========== 时间点记录 API ==========

// 新增时间点记录
app.post('/api/instant', auth, (req, res) => {
  const { event_type, event_label, recorded_by, recorded_at, note } = req.body;
  const stmt = db.prepare(`
    INSERT INTO instant_records (event_type, event_label, recorded_by, recorded_at, note)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(event_type, event_label, recorded_by, recorded_at || new Date().toISOString(), note || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

// 查询时间点记录（最近 N 条）
app.get('/api/instant', auth, (req, res) => {
  const { event_type, limit = 20 } = req.query;
  let sql = 'SELECT * FROM instant_records';
  const params = [];
  if (event_type) {
    sql += ' WHERE event_type = ?';
    params.push(event_type);
  }
  sql += ' ORDER BY recorded_at DESC LIMIT ?';
  params.push(Number(limit));
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// 删除时间点记录
app.delete('/api/instant/:id', auth, (req, res) => {
  db.prepare('DELETE FROM instant_records WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ========== 持续时间记录 API ==========

// 开始一个持续事件
app.post('/api/duration/start', auth, (req, res) => {
  const { event_type, event_label, started_by, started_at, note } = req.body;
  const stmt = db.prepare(`
    INSERT INTO duration_records (event_type, event_label, started_by, started_at, note)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(event_type, event_label, started_by, started_at || new Date().toISOString(), note || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

// 结束一个持续事件（任意家庭成员可结束）
app.post('/api/duration/end/:id', auth, (req, res) => {
  const { ended_by, ended_at } = req.body;
  const endTime = ended_at || new Date().toISOString();
  
  const record = db.prepare('SELECT * FROM duration_records WHERE id = ?').get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: '记录不存在' });
  }
  if (record.ended_at) {
    return res.status(400).json({ error: '该事件已经结束' });
  }

  const startTime = new Date(record.started_at);
  const endTimeObj = new Date(endTime);
  const durationMinutes = (endTimeObj - startTime) / 1000 / 60;

  db.prepare(`
    UPDATE duration_records SET ended_by = ?, ended_at = ?, duration_minutes = ? WHERE id = ?
  `).run(ended_by, endTime, Math.round(durationMinutes * 10) / 10, req.params.id);

  res.json({ success: true, duration_minutes: Math.round(durationMinutes * 10) / 10 });
});

// 修改持续事件的类型
app.put('/api/duration/:id', auth, (req, res) => {
  const { event_type, event_label, note } = req.body;
  const sets = [];
  const params = [];
  if (event_type !== undefined) { sets.push('event_type = ?'); params.push(event_type); }
  if (event_label !== undefined) { sets.push('event_label = ?'); params.push(event_label); }
  if (note !== undefined) { sets.push('note = ?'); params.push(note); }
  if (sets.length === 0) return res.status(400).json({ error: '没有要修改的内容' });
  params.push(req.params.id);
  db.prepare(`UPDATE duration_records SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// 查询持续时间记录
app.get('/api/duration', auth, (req, res) => {
  const { event_type, active_only, limit = 20 } = req.query;
  let sql = 'SELECT * FROM duration_records WHERE 1=1';
  const params = [];
  if (event_type) {
    sql += ' AND event_type = ?';
    params.push(event_type);
  }
  if (active_only === 'true') {
    sql += " AND (ended_at = '' OR ended_at IS NULL)";
  }
  sql += ' ORDER BY started_at DESC LIMIT ?';
  params.push(Number(limit));
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// 删除持续时间记录
app.delete('/api/duration/:id', auth, (req, res) => {
  db.prepare('DELETE FROM duration_records WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ========== 获取所有进行中的事件（首页展示） ==========
app.get('/api/active', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM duration_records 
    WHERE ended_at = '' OR ended_at IS NULL 
    ORDER BY started_at DESC
  `).all();
  res.json(rows);
});

// ========== 获取今日概览 ==========
app.get('/api/today', auth, (req, res) => {
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + 
    String(today.getMonth() + 1).padStart(2, '0') + '-' + 
    String(today.getDate()).padStart(2, '0');
  
  const instants = db.prepare(`
    SELECT * FROM instant_records 
    WHERE recorded_at >= ? 
    ORDER BY recorded_at DESC
  `).all(todayStr);

  const durations = db.prepare(`
    SELECT * FROM duration_records 
    WHERE started_at >= ? 
    ORDER BY started_at DESC
  `).all(todayStr);

  res.json({ instants, durations });
});

// ========== SPA fallback ==========
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== 确保 data 目录存在 ==========
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ========== 启动服务 ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log(`小记录服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`密码: ${PASSWORD}`);
});
