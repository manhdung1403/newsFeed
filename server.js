const express = require('express');
const http = require('http'); // Thêm để chạy Socket.io
const { Server } = require('socket.io'); // Thêm để chạy Socket.io
const sql = require('mssql');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app); // Tạo server để dùng chung cho Express và Socket.io

// Khởi tạo Socket.io
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(express.json());
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.urlencoded({ extended: true }));

// Cấu hình session
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

// Chia sẻ session cho Socket.io (nếu cần dùng dữ liệu session trong chat)
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Configure multer for uploads
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

// Image upload endpoint
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

// Cấu hình SQL Server
const dbConfig = {
    user: 'sa',
    password: '0944364247',
    server: 'localhost',
    database: 'newsFeedDb',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// --- LOGIC REAL-TIME CHAT (SOCKET.IO) ---
const onlineUsers = new Map(); // Map lưu trữ userId => socketId

io.on('connection', (socket) => {
    console.log(`⚡ Kết nối mới: ${socket.id}`);

    // Đăng ký user online
    socket.on('register', (userId) => {
        socket.userId = userId;
        onlineUsers.set(String(userId), socket.id);
        io.emit('user_status', { userId, status: 'online', lastSeen: null });
    });

    // Xử lý gửi tin nhắn
    socket.on('send_message', async (data) => {
        // data may include: senderId, receiverId, text, replyToId, conversationId, imageUrl
        const { senderId, receiverId, text, replyToId, conversationId, imageUrl } = data;
        try {
            console.log('send_message payload:', { senderId, receiverId, text, replyToId, conversationId, hasImage: !!imageUrl });
            // Avoid passing large data-URI strings into VARCHAR DB param (causes validation errors)
            const imgParam = (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('data:')) ? null : imageUrl;
            let pool = await sql.connect(dbConfig);
            // Insert message and associate with conversation if provided
            const result = await pool.request()
                .input('senderId', sql.Int, senderId)
                .input('receiverId', sql.Int, receiverId || null)
                .input('text', sql.NVarChar, text || null)
                .input('replyId', sql.Int, replyToId || null)
                .input('convId', sql.Int, conversationId || null)
                .input('img', sql.VarChar, imgParam)
                .query(`
                    INSERT INTO Messages (conversation_id, sender_id, receiver_id, message_text, reply_to_id, image_url)
                    OUTPUT INSERTED.id, INSERTED.created_at
                    VALUES (@convId, @senderId, @receiverId, @text, @replyId, @img)
                `);

            const savedMsg = { ...data, id: result.recordset[0].id, created_at: result.recordset[0].created_at };

            // Update conversation last_message/last_updated when conversationId present
            if (conversationId) {
                await pool.request()
                    .input('convId', sql.Int, conversationId)
                    .input('text', sql.NVarChar, text || null)
                    .query(`UPDATE Conversations SET last_message = @text, last_updated = GETDATE() WHERE id = @convId`);

                // Emit to conversation room so all participants see it
                io.to(`conversation_${conversationId}`).emit('receive_message', savedMsg);
            } else {
                // legacy: direct message, emit to receiver socket if online
                const receiverSocketId = onlineUsers.get(String(receiverId));
                if (receiverSocketId) io.to(receiverSocketId).emit('receive_message', savedMsg);
            }

            socket.emit('message_sent', savedMsg);
        } catch (err) {
            console.error("Lỗi chat:", err);
        }
    });

    // Đánh dấu đã đọc
    socket.on('read_message', async (data) => {
        // data: { messageId, senderId, receiverId }
        try {
            let pool = await sql.connect(dbConfig);
            await pool.request()
                .input('messageId', sql.Int, data.messageId)
                .query(`UPDATE Messages SET seen = 1, seen_at = GETDATE() WHERE id = @messageId`);

            // notify sender
            const senderSocket = onlineUsers.get(String(data.senderId));
            if (senderSocket) io.to(senderSocket).emit('message_seen', { messageId: data.messageId, by: data.receiverId });
        } catch (err) { console.error(err); }
    });

    // Reaction (emoji)
    socket.on('reaction', async (data) => {
        // data: { messageId, emoji }
        try {
            let pool = await sql.connect(dbConfig);
            await pool.request()
                .input('messageId', sql.Int, data.messageId)
                .input('emoji', sql.NVarChar, data.emoji)
                .query(`UPDATE Messages SET reaction = @emoji WHERE id = @messageId`);
            io.emit('reaction', data);
        } catch (err) { console.error(err); }
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            onlineUsers.delete(String(socket.userId));
            io.emit('user_status', { userId: socket.userId, status: 'offline', lastSeen: new Date().toISOString() });
        }
    });
});

// --- CÁC API NEWSFEED HIỆN CÓ CỦA BẠN ---

// Middleware kiểm tra đăng nhập
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    } else {
        return res.status(401).json({ error: 'Chưa đăng nhập' });
    }
}

// API đăng ký
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, dob } = req.body;
        if (!username || !email || !password || !dob) {
            return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
        }
        let pool = await sql.connect(dbConfig);
        let checkResult = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT id FROM Users WHERE email = @email');

        if (checkResult.recordset.length > 0) {
            return res.status(400).json({ error: 'Email đã được sử dụng' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        let result = await pool.request()
            .input('username', sql.NVarChar, username)
            .input('email', sql.VarChar, email)
            .input('password', sql.VarChar, hashedPassword)
            .input('dob', sql.Date, dob)
            .query(`INSERT INTO Users (username, email, password, dob) 
                    OUTPUT INSERTED.id, INSERTED.username, INSERTED.email
                    VALUES (@username, @email, @password, @dob)`);

        const newUser = result.recordset[0];
        req.session.userId = newUser.id;
        req.session.username = newUser.username;
        res.json({ success: true, user: newUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API đăng nhập
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT id, username, email, password FROM Users WHERE email = @email');

        if (result.recordset.length === 0) return res.status(401).json({ error: 'Sai email/mật khẩu' });
        const user = result.recordset[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Sai email/mật khẩu' });

        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ success: true, user: { id: user.id, username: user.username } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API đăng xuất
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

// API kiểm tra trạng thái
app.get('/api/auth/status', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ loggedIn: true, user: { id: req.session.userId, username: req.session.username } });
    } else {
        res.json({ loggedIn: false });
    }
});

// API lấy posts
app.get('/api/posts', requireAuth, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT p.id, p.image_url, p.caption, p.created_at, u.username
            FROM Posts p LEFT JOIN Users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send("Lỗi server: " + err.message);
    }
});

// API lấy tin nhắn chat (Mới thêm)
app.get('/api/messages/:receiverId', requireAuth, async (req, res) => {
    try {
        const senderId = req.session.userId;
        const receiverId = req.params.receiverId;
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('sId', sql.Int, senderId)
            .input('rId', sql.Int, receiverId)
            .query(`SELECT * FROM Messages 
                    WHERE (sender_id = @sId AND receiver_id = @rId) 
                    OR (sender_id = @rId AND receiver_id = @sId) 
                    ORDER BY created_at ASC`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API lấy danh sách conversation của user
app.get('/api/conversations', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`SELECT c.id, c.title, c.last_message, c.last_updated
                    FROM Conversations c
                    WHERE c.id IN (SELECT conversation_id FROM ConversationParticipants WHERE user_id = @userId)
                    ORDER BY c.last_updated DESC`);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// API lấy messages theo conversation id
app.get('/api/conversations/:id/messages', requireAuth, async (req, res) => {
    try {
        const convId = parseInt(req.params.id, 10);
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('convId', sql.Int, convId)
            .query(`SELECT m.id, m.sender_id, m.receiver_id, m.message_text as text, m.reply_to_id as reply_to, m.image_url, m.created_at, m.seen, m.reaction
                    FROM Messages m
                    WHERE m.conversation_id = @convId
                    ORDER BY m.created_at ASC`);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Tạo conversation mới
app.post('/api/conversations', requireAuth, async (req, res) => {
    try {
        const { participantIds, title } = req.body; // participantIds array
        let pool = await sql.connect(dbConfig);
        // Prevent creating duplicate conversations with the same participant set.
        const users = Array.from(new Set([req.session.userId].concat(participantIds || []))).map(x => parseInt(x, 10));
        const count = users.length;
        // Build comma-separated list for IN() — safe because values are ints from session/body and we cast above.
        const idsList = users.join(',');

        // Find existing conversation that contains exactly these users
        const checkQuery = `
            SELECT cp.conversation_id
            FROM ConversationParticipants cp
            WHERE cp.user_id IN (${idsList})
            GROUP BY cp.conversation_id
            HAVING COUNT(DISTINCT cp.user_id) = ${count}
            AND (SELECT COUNT(*) FROM ConversationParticipants cp2 WHERE cp2.conversation_id = cp.conversation_id) = ${count}
        `;
        const existing = await pool.request().query(checkQuery);
        if (existing.recordset && existing.recordset.length > 0) {
            const convId = existing.recordset[0].conversation_id;
            return res.json({ success: true, id: convId, existed: true });
        }

        // Create new conversation
        const insert = await pool.request()
            .input('title', sql.NVarChar, title || null)
            .query(`INSERT INTO Conversations (title) OUTPUT INSERTED.id VALUES (@title)`);
        const convId = insert.recordset[0].id;
        for (const u of users) {
            await pool.request()
                .input('convId', sql.Int, convId)
                .input('u', sql.Int, u)
                .query(`INSERT INTO ConversationParticipants (conversation_id, user_id) VALUES (@convId, @u)`);
        }
        res.json({ success: true, id: convId, existed: false });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Chạy Server
const PORT = 3000;
server.listen(PORT, async () => {
    console.log(`Server NewsFeed + Chat đang chạy tại http://localhost:${PORT}`);
    try {
        let pool = await sql.connect(dbConfig);
        if (pool.connected) console.log("✅ Kết nối SQL Server thành công.");
    } catch (err) {
        console.error("❌ Lỗi Database:", err.message);
    }
});

// Lấy danh sách users (không gồm chính user) và trạng thái follow
app.get('/api/users', requireAuth, async (req, res) => {
    try {
        const me = req.session.userId;
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('me', sql.Int, me)
            .query(`SELECT u.id, u.username, u.avatar,
                CASE WHEN f.follower_id IS NULL THEN 0 ELSE 1 END AS is_following
                FROM Users u
                LEFT JOIN Follows f ON f.following_id = u.id AND f.follower_id = @me
                WHERE u.id <> @me`);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Follow user
app.post('/api/follow', requireAuth, async (req, res) => {
    try {
        const me = req.session.userId;
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('me', sql.Int, me)
            .input('userId', sql.Int, userId)
            .query(`IF NOT EXISTS (SELECT 1 FROM Follows WHERE follower_id=@me AND following_id=@userId)
                INSERT INTO Follows (follower_id, following_id) VALUES (@me, @userId)`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Unfollow
app.post('/api/unfollow', requireAuth, async (req, res) => {
    try {
        const me = req.session.userId;
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('me', sql.Int, me)
            .input('userId', sql.Int, userId)
            .query(`DELETE FROM Follows WHERE follower_id=@me AND following_id=@userId`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lấy participants (id và username) của conversation
app.get('/api/conversations/:id/participants', requireAuth, async (req, res) => {
    try {
        const convId = parseInt(req.params.id, 10);
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('convId', sql.Int, convId)
            .query(`
                SELECT u.id, u.username
                FROM ConversationParticipants cp
                JOIN Users u ON cp.user_id = u.id
                WHERE cp.conversation_id = @convId
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Xóa conversation (và các messages + participants liên quan)
app.delete('/api/conversations/:id', requireAuth, async (req, res) => {
    try {
        const convId = parseInt(req.params.id, 10);
        const userId = req.session.userId;
        let pool = await sql.connect(dbConfig);

        // Kiểm tra user có tham gia conversation này không
        const check = await pool.request()
            .input('convId', sql.Int, convId)
            .input('userId', sql.Int, userId)
            .query(`SELECT 1 FROM ConversationParticipants WHERE conversation_id = @convId AND user_id = @userId`);
        if (!check.recordset || check.recordset.length === 0) return res.status(403).json({ error: 'Không có quyền xóa' });

        // Xóa messages, participants, rồi conversation (theo thứ tự để tránh vi phạm FK)
        await pool.request().input('convId', sql.Int, convId).query(`DELETE FROM Messages WHERE conversation_id = @convId`);
        await pool.request().input('convId', sql.Int, convId).query(`DELETE FROM ConversationParticipants WHERE conversation_id = @convId`);
        await pool.request().input('convId', sql.Int, convId).query(`DELETE FROM Conversations WHERE id = @convId`);

        // Thông báo realtime tới những client trong room (nếu có)
        io.to(`conversation_${convId}`).emit('conversation_deleted', { conversationId: convId });

        res.json({ success: true });
    } catch (err) {
        console.error('Delete conversation error', err);
        res.status(500).json({ error: err.message });
    }
});