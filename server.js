const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const app = express();
const PORT = 3001;

// --- 資料庫初始化 ---
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ submissions: [] }).write();

// --- 靜態資料夾 ---
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// --- Multer 設定（影片上傳）---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/avi', 'video/webm'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('只接受 MP4/MOV/AVI/WEBM 格式'));
  }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('./uploads'));
app.use(express.static('./public'));

// ============================================================
// 前台 API
// ============================================================
app.post('/api/upload', upload.single('video'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '請選擇影片檔案' });
    const submission = {
      id: uuidv4(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      challengeTag: req.body.challengeTag || '未知挑戰',
      uploaderName: req.body.uploaderName || '匿名用戶',
      email: req.body.email || '',
      status: 'pending',
      reward: 0,
      note: '',
      uploadedAt: new Date().toISOString(),
      reviewedAt: null,
    };
    db.get('submissions').push(submission).write();
    console.log(`✅ 新上傳: ${submission.originalName} (${submission.challengeTag})`);
    res.json({ success: true, id: submission.id, message: '上傳成功！' });
  } catch (err) {
    res.status(500).json({ error: '上傳失敗：' + err.message });
  }
});

// ============================================================
// 後台 API
// ============================================================
app.get('/api/admin/submissions', (req, res) => {
  const { status } = req.query;
  let submissions = db.get('submissions').value();
  if (status) submissions = submissions.filter(s => s.status === status);
  res.json(submissions.slice().reverse());
});

app.get('/api/admin/stats', (req, res) => {
  const all = db.get('submissions').value();
  res.json({
    total: all.length,
    pending: all.filter(s => s.status === 'pending').length,
    approved: all.filter(s => s.status === 'approved').length,
    rejected: all.filter(s => s.status === 'rejected').length,
    totalReward: all.reduce((sum, s) => sum + (s.reward || 0), 0),
  });
});

app.patch('/api/admin/submissions/:id', (req, res) => {
  const { id } = req.params;
  const { status, reward, note } = req.body;
  const submission = db.get('submissions').find({ id }).value();
  if (!submission) return res.status(404).json({ error: '找不到此投稿' });
  db.get('submissions').find({ id }).assign({
    status: status || submission.status,
    reward: reward !== undefined ? Number(reward) : submission.reward,
    note: note !== undefined ? note : submission.note,
    reviewedAt: new Date().toISOString(),
  }).write();
  res.json({ success: true });
});

app.delete('/api/admin/submissions/:id', (req, res) => {
  const { id } = req.params;
  const submission = db.get('submissions').find({ id }).value();
  if (!submission) return res.status(404).json({ error: '找不到此投稿' });
  const filePath = path.join('./uploads', submission.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.get('submissions').remove({ id }).write();
  res.json({ success: true });
});

app.post('/api/admin/seed', (req, res) => {
  const tags = ['#PSK五分鐘戰神', '#PSK溫和實驗室', '#PSK海洋大使'];
  const names = ['小美', '芯芯', '雅惠', 'Vivian', '小橙'];
  const statuses = ['pending', 'pending', 'approved', 'rejected'];
  for (let i = 0; i < 8; i++) {
    db.get('submissions').push({
      id: uuidv4(),
      filename: 'demo_video.mp4',
      originalName: `實測影片_${i + 1}.mp4`,
      size: Math.floor(Math.random() * 50000000) + 5000000,
      challengeTag: tags[i % 3],
      uploaderName: names[i % 5],
      email: `user${i}@example.com`,
      status: statuses[i % 4],
      reward: statuses[i % 4] === 'approved' ? 500 : 0,
      note: statuses[i % 4] === 'rejected' ? '影片品質不符合要求' : '',
      uploadedAt: new Date(Date.now() - i * 3600000 * 5).toISOString(),
      reviewedAt: statuses[i % 4] !== 'pending' ? new Date().toISOString() : null,
    }).write();
  }
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`\n🌊 PSK Server 已啟動！`);
  console.log(`   前台網站: http://localhost:5173`);
  console.log(`   後台管理: http://localhost:3001/admin.html\n`);
});
