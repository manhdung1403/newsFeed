const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Import configs and utils
const { dbConfig, sql } = require('./config/database');
const { requireAuth } = require('./middleware/authMiddleware');
const { initializeSocket } = require('./utils/socket');

// Import routes
const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();
const server = http.createServer(app);

// --- SOCKET.IO ---
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// --- MIDDLEWARE ---
app.use(express.json({ limit: '50mb' }));
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const sessionMiddleware = session({
    secret: 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
});
app.use(sessionMiddleware);

// Chia sẻ session với Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// --- MULTER (upload ảnh) ---
const uploadsDir = path.join(__dirname, '../public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '';
        const name = Date.now() + '-' + Math.random().toString(36).substring(2, 8) + ext;
        cb(null, name);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Initialize Socket.IO
initializeSocket(io);

// --- UPLOAD API ---
app.post('/api/upload-image', requireAuth, upload.single('image'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file' });
        const url = `/uploads/${encodeURIComponent(req.file.filename)}`;
        res.json({ success: true, url });
    } catch (err) {
        console.error('upload error', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);

// --- ERROR HANDLERS ---
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API không tồn tại' });
});

app.use((err, req, res, next) => {
    console.error('Lỗi middleware:', err);
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Payload quá lớn (tối đa 50MB).' });
    }
    res.status(500).json({ error: 'Lỗi server: ' + (err && err.message ? err.message : 'Không xác định') });
});

// --- START SERVER ---
const PORT = 3000;
server.listen(PORT, async () => {
    console.log(`🚀 Server NewsFeed + Chat đang chạy tại http://localhost:${PORT}`);
    try {
        let pool = await sql.connect(dbConfig);
        if (pool.connected) console.log("✅ Kết nối SQL Server thành công.");
    } catch (err) {
        console.error("❌ Lỗi Database:", err.message);
    }
});