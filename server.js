const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sql = require('mssql');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');

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
app.use(express.static(path.join(__dirname, 'public')));

// --- MULTER (upload ảnh) ---
const uploadsDir = path.join(__dirname, 'public', 'uploads');
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

// --- DATABASE CONFIG ---
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

// --- AUTH MIDDLEWARE ---
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ error: 'Chưa đăng nhập' });
}

// ============================================================
// SOCKET.IO REAL-TIME CHAT
// ============================================================
const onlineUsers = new Map();       // userId => socketId (giữ 1 cho user_status/chat cũ)
const userSockets = new Map();       // userId => Set<socketId> (nhiều tab/màn hình)

function emitToUser(userId, event, data) {
    const ids = userSockets.get(String(userId));
    if (ids) ids.forEach(sid => io.to(sid).emit(event, data));
}

io.on('connection', (socket) => {
    console.log(`⚡ Kết nối mới: ${socket.id}`);

    socket.on('register', (userId) => {
        socket.userId = userId;
        const k = String(userId);
        onlineUsers.set(k, socket.id);
        if (!userSockets.has(k)) userSockets.set(k, new Set());
        userSockets.get(k).add(socket.id);
        io.emit('user_status', { userId, status: 'online', lastSeen: null });
    });

    socket.on('join', (convId) => {
        if (convId) socket.join(`conversation_${convId}`);
    });

    socket.on('send_message', async (data) => {
        const { senderId, receiverId, text, replyToId, conversationId, imageUrl } = data;
        try {
            const imgParam = (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('data:')) ? null : imageUrl;
            let pool = await sql.connect(dbConfig);
            // Nếu dùng conversationId mà receiverId null, lấy 1 participant khác làm receiver (DB có thể yêu cầu NOT NULL)
            let recvId = receiverId;
            if ((recvId == null || recvId === '') && conversationId) {
                const pr = await pool.request()
                    .input('convId', sql.Int, conversationId)
                    .input('senderId', sql.Int, senderId)
                    .query(`SELECT TOP 1 user_id FROM ConversationParticipants WHERE conversation_id = @convId AND user_id <> @senderId`);
                if (pr.recordset && pr.recordset[0]) recvId = pr.recordset[0].user_id;
            }
            const result = await pool.request()
                .input('senderId', sql.Int, senderId)
                .input('receiverId', sql.Int, recvId || senderId)
                .input('text', sql.NVarChar, text || null)
                .input('replyId', sql.Int, replyToId || null)
                .input('convId', sql.Int, conversationId || null)
                .input('img', sql.VarChar, imgParam)
                .query(`
                    INSERT INTO Messages (conversation_id, sender_id, receiver_id, message_text, reply_to_id, image_url)
                    OUTPUT INSERTED.id, INSERTED.created_at
                    VALUES (@convId, @senderId, @receiverId, @text, @replyId, @img)
                `);

            // If this message is a reply, enrich payload so UI can render quote + jump to target.
            let reply_to = null;
            if (replyToId) {
                const replyRes = await pool.request()
                    .input('replyId', sql.Int, replyToId)
                    .query(`SELECT id, sender_id, message_text FROM Messages WHERE id = @replyId`);

                if (replyRes.recordset && replyRes.recordset.length > 0) {
                    const r = replyRes.recordset[0];
                    reply_to = { id: r.id, sender_id: r.sender_id, text: r.message_text };
                }
            }

            const savedMsg = {
                ...data,
                id: result.recordset[0].id,
                created_at: result.recordset[0].created_at,
                reply_to
            };

            if (conversationId) {
                await pool.request()
                    .input('convId', sql.Int, conversationId)
                    .input('text', sql.NVarChar, text || null)
                    .query(`UPDATE Conversations SET last_message = @text, last_updated = GETDATE() WHERE id = @convId`);

                io.to(`conversation_${conversationId}`).emit('receive_message', savedMsg);
                const parts = await pool.request()
                    .input('convId', sql.Int, conversationId)
                    .query(`SELECT user_id FROM ConversationParticipants WHERE conversation_id = @convId`);
                for (const p of (parts.recordset || [])) {
                    if (p.user_id !== senderId) emitToUser(p.user_id, 'unread_badge_update');
                }
            } else {
                const receiverSocketId = onlineUsers.get(String(receiverId));
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('receive_message', savedMsg);
                    emitToUser(receiverId, 'unread_badge_update');
                }
            }

            socket.emit('message_sent', savedMsg);
        } catch (err) {
            console.error("Lỗi chat:", err);
        }
    });

    socket.on('read_message', async (data) => {
        try {
            let pool = await sql.connect(dbConfig);
            await pool.request()
                .input('messageId', sql.Int, data.messageId)
                .query(`UPDATE Messages SET seen = 1, seen_at = GETDATE() WHERE id = @messageId`);

            const senderSocket = onlineUsers.get(String(data.senderId));
            if (senderSocket) io.to(senderSocket).emit('message_seen', { messageId: data.messageId, by: data.receiverId });
        } catch (err) { console.error(err); }
    });

    socket.on('reaction', async (data) => {
        try {
            let pool = await sql.connect(dbConfig);
            await pool.request()
                .input('messageId', sql.Int, data.messageId)
                .input('emoji', sql.NVarChar, data.emoji)
                .query(`UPDATE Messages SET reaction = @emoji WHERE id = @messageId`);
            io.emit('reaction', data);
        } catch (err) { console.error(err); }
    });

    socket.on('disconnect', async () => {
        if (socket.userId) {
            const k = String(socket.userId);
            const set = userSockets.get(k);
            if (set) { set.delete(socket.id); if (set.size === 0) userSockets.delete(k); }
            if (onlineUsers.get(k) === socket.id) onlineUsers.delete(k);
            const lastSeenTime = new Date().toISOString();
            try {
                let pool = await sql.connect(dbConfig);
                await pool.request()
                    .input('uid', sql.Int, socket.userId)
                    .query(`UPDATE Users SET last_seen = GETDATE() WHERE id = @uid`);
            } catch (e) {
                console.error('Lỗi cập nhật last_seen:', e);
            }
            io.emit('user_status', { userId: socket.userId, status: 'offline', lastSeen: lastSeenTime });
        }
    });
});

// ============================================================
// UPLOAD API
// ============================================================
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

// ============================================================
// AUTH APIs
// ============================================================
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, dob } = req.body;

        if (!username || !email || !password || !dob) {
            return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
            return res.status(400).json({ error: 'Ngày sinh không hợp lệ' });
        }
        const todayStr = new Date().toISOString().split('T')[0];
        if (dob > todayStr) {
            return res.status(400).json({ error: 'Ngày sinh không được sau ngày hiện tại' });
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
        res.json({ success: true, message: 'Đăng ký thành công', user: newUser });
    } catch (err) {
        console.error('Lỗi đăng ký:', err);
        res.status(500).json({ error: 'Lỗi server: ' + err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
        }

        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT id, username, email, password FROM Users WHERE email = @email');

        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
        }

        const user = result.recordset[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ success: true, message: 'Đăng nhập thành công', user: { id: user.id, username: user.username, email: user.email } });
    } catch (err) {
        console.error('Lỗi đăng nhập:', err);
        res.status(500).json({ error: 'Lỗi server: ' + err.message });
    }
});

app.post('/api/logout', async (req, res) => {
    const userId = req.session && req.session.userId;
    if (userId) {
        try {
            let pool = await sql.connect(dbConfig);
            await pool.request()
                .input('uid', sql.Int, userId)
                .query(`UPDATE Users SET last_seen = GETDATE() WHERE id = @uid`);
        } catch (e) { console.error('logout last_seen error', e); }
    }
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: 'Lỗi khi đăng xuất' });
        res.json({ success: true, message: 'Đăng xuất thành công' });
    });
});

app.get('/api/auth/status', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ loggedIn: true, user: { id: req.session.userId, username: req.session.username } });
    } else {
        res.json({ loggedIn: false });
    }
});

// ============================================================
// POST APIs
// ============================================================
app.get('/api/posts', requireAuth, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('currentUserId', sql.Int, req.session.userId)
            .query(`
                SELECT 
                    p.id, 
                    p.image_url, 
                    p.caption, 
                    p.created_at, 
                    u.id AS user_id, 
                    u.username,
                    ISNULL(lc.like_count, 0) AS like_count,
                    CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_current_user
                FROM Posts p
                LEFT JOIN Users u ON p.user_id = u.id
                LEFT JOIN (
                    SELECT post_id, COUNT(*) AS like_count
                    FROM Likes
                    GROUP BY post_id
                ) lc ON lc.post_id = p.id
                LEFT JOIN Likes ul 
                    ON ul.post_id = p.id AND ul.user_id = @currentUserId
                ORDER BY p.created_at DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server: ' + err.message });
    }
});

app.post('/api/posts', requireAuth, async (req, res) => {
    try {
        const { image_url, caption } = req.body;
        const userId = req.session.userId;

        if (!image_url) {
            return res.status(400).json({ error: 'URL ảnh là bắt buộc' });
        }

        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('user_id', sql.Int, userId)
            .input('image_url', sql.NVarChar(sql.MAX), image_url)
            .input('caption', sql.NVarChar, caption || null)
            .query(`
                INSERT INTO Posts (user_id, image_url, caption, created_at)
                OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.image_url, INSERTED.caption, INSERTED.created_at
                VALUES (@user_id, @image_url, @caption, GETDATE())
            `);

        res.json({ success: true, message: 'Bài đăng đã được tạo thành công', post: result.recordset[0] });
    } catch (err) {
        console.error('Lỗi tạo bài đăng:', err);
        res.status(500).json({ error: 'Lỗi server: ' + err.message });
    }
});

app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
    try {
        const postId = parseInt(req.params.id, 10);
        const userId = req.session.userId;

        if (isNaN(postId)) return res.status(400).json({ error: 'ID bài viết không hợp lệ' });

        let pool = await sql.connect(dbConfig);
        let existing = await pool.request()
            .input('post_id', sql.Int, postId)
            .input('user_id', sql.Int, userId)
            .query(`SELECT id FROM Likes WHERE post_id = @post_id AND user_id = @user_id`);

        let liked;
        if (existing.recordset.length > 0) {
            await pool.request()
                .input('post_id', sql.Int, postId)
                .input('user_id', sql.Int, userId)
                .query(`DELETE FROM Likes WHERE post_id = @post_id AND user_id = @user_id`);
            liked = false;
        } else {
            await pool.request()
                .input('post_id', sql.Int, postId)
                .input('user_id', sql.Int, userId)
                .query(`INSERT INTO Likes (post_id, user_id) VALUES (@post_id, @user_id)`);
            liked = true;
        }

        let countResult = await pool.request()
            .input('post_id', sql.Int, postId)
            .query(`SELECT COUNT(*) AS like_count FROM Likes WHERE post_id = @post_id`);

        res.json({ success: true, liked, like_count: countResult.recordset[0].like_count });
    } catch (err) {
        console.error('Lỗi toggle tim:', err);
        res.status(500).json({ error: 'Lỗi server: ' + err.message });
    }
});

// ============================================================
// USER & FOLLOW APIs
// ============================================================
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

// ============================================================
// CHAT / CONVERSATION APIs
// ============================================================
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/conversations', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT c.id, c.title, c.last_message, c.last_updated, c.is_group,
                    oa.other_id, oa.other_name, oa.other_last_seen
                FROM Conversations c
                OUTER APPLY (
                    SELECT TOP 1
                        u.id as other_id,
                        u.username as other_name,
                        u.last_seen as other_last_seen
                    FROM ConversationParticipants cp2
                    JOIN Users u ON u.id = cp2.user_id
                    WHERE cp2.conversation_id = c.id
                      AND cp2.user_id <> @userId
                    ORDER BY u.id
                ) oa
                WHERE c.id IN (SELECT conversation_id FROM ConversationParticipants WHERE user_id = @userId)
                ORDER BY c.last_updated DESC
            `);
        const rows = result.recordset.map(r => ({
            ...r,
            other_is_online: onlineUsers.has(String(r.other_id))
        }));
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Total unread count for header badge (based on Messages.seen flag).
app.get('/api/conversations/unread-total', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT COUNT(1) AS unread_count
                FROM Messages m
                WHERE m.conversation_id IS NOT NULL
                  AND m.seen = 0
                  AND m.sender_id <> @userId
                  AND m.conversation_id IN (
                      SELECT conversation_id
                      FROM ConversationParticipants
                      WHERE user_id = @userId
                  )
            `);

        const unread = result.recordset && result.recordset[0] ? result.recordset[0].unread_count : 0;
        res.json({ unreadCount: Number(unread) || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/conversations/:id/mark-read', requireAuth, async (req, res) => {
    try {
        const convId = parseInt(req.params.id, 10);
        const userId = req.session.userId;
        let pool = await sql.connect(dbConfig);
        const check = await pool.request()
            .input('convId', sql.Int, convId)
            .input('userId', sql.Int, userId)
            .query(`SELECT 1 FROM ConversationParticipants WHERE conversation_id = @convId AND user_id = @userId`);
        if (!check.recordset || check.recordset.length === 0) {
            return res.status(403).json({ error: 'Không có quyền' });
        }
        await pool.request()
            .input('convId', sql.Int, convId)
            .input('userId', sql.Int, userId)
            .query(`UPDATE Messages SET seen = 1, seen_at = GETDATE() WHERE conversation_id = @convId AND sender_id <> @userId`);
        emitToUser(userId, 'unread_badge_update');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/conversations/:id/messages', requireAuth, async (req, res) => {
    try {
        const convId = parseInt(req.params.id, 10);
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('convId', sql.Int, convId)
            .query(`
                SELECT 
                    m.id, m.sender_id, m.receiver_id, m.message_text as text,
                    m.image_url, m.created_at, m.seen, m.reaction,
                    rm.id as reply_to_id,
                    rm.sender_id as reply_sender_id,
                    rm.message_text as reply_text
                FROM Messages m
                LEFT JOIN Messages rm ON m.reply_to_id = rm.id
                WHERE m.conversation_id = @convId
                ORDER BY m.created_at ASC
            `);

        const rows = result.recordset.map(m => {
            const reply_to = m.reply_to_id
                ? { id: m.reply_to_id, sender_id: m.reply_sender_id, text: m.reply_text }
                : null;
            return { ...m, reply_to };
        });
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conversations', requireAuth, async (req, res) => {
    try {
        const { participantIds, title, isGroup } = req.body;
        const groupFlag = isGroup ? 1 : 0;
        let pool = await sql.connect(dbConfig);
        const users = Array.from(new Set([req.session.userId].concat(participantIds || []))).map(x => parseInt(x, 10));
        const count = users.length;
        const idsList = users.join(',');

        const checkQuery = `
            SELECT cp.conversation_id
            FROM ConversationParticipants cp
            JOIN Conversations c ON c.id = cp.conversation_id
            WHERE cp.user_id IN (${idsList})
              AND c.is_group = ${groupFlag}
            GROUP BY cp.conversation_id
            HAVING COUNT(DISTINCT cp.user_id) = ${count}
            AND (SELECT COUNT(*) FROM ConversationParticipants cp2 WHERE cp2.conversation_id = cp.conversation_id) = ${count}
        `;
        const existing = await pool.request().query(checkQuery);
        if (existing.recordset && existing.recordset.length > 0) {
            return res.json({ success: true, id: existing.recordset[0].conversation_id, existed: true });
        }

        const insert = await pool.request()
            .input('title', sql.NVarChar, title || null)
            .input('isGroup', sql.Bit, groupFlag)
            .query(`INSERT INTO Conversations (title, is_group) OUTPUT INSERTED.id VALUES (@title, @isGroup)`);
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

app.get('/api/conversations/:id/participants', requireAuth, async (req, res) => {
    try {
        const convId = parseInt(req.params.id, 10);
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('convId', sql.Int, convId)
            .query(`
                SELECT u.id, u.username, u.last_seen
                FROM ConversationParticipants cp
                JOIN Users u ON cp.user_id = u.id
                WHERE cp.conversation_id = @convId
            `);
        const rows = result.recordset.map(u => ({
            ...u,
            is_online: onlineUsers.has(String(u.id))
        }));
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/conversations/:id', requireAuth, async (req, res) => {
    try {
        const convId = parseInt(req.params.id, 10);
        const userId = req.session.userId;
        let pool = await sql.connect(dbConfig);

        const check = await pool.request()
            .input('convId', sql.Int, convId)
            .input('userId', sql.Int, userId)
            .query(`SELECT 1 FROM ConversationParticipants WHERE conversation_id = @convId AND user_id = @userId`);
        if (!check.recordset || check.recordset.length === 0) {
            return res.status(403).json({ error: 'Không có quyền xóa' });
        }

        await pool.request().input('convId', sql.Int, convId).query(`DELETE FROM Messages WHERE conversation_id = @convId`);
        await pool.request().input('convId', sql.Int, convId).query(`DELETE FROM ConversationParticipants WHERE conversation_id = @convId`);
        await pool.request().input('convId', sql.Int, convId).query(`DELETE FROM Conversations WHERE id = @convId`);

        io.to(`conversation_${convId}`).emit('conversation_deleted', { conversationId: convId });
        res.json({ success: true });
    } catch (err) {
        console.error('Delete conversation error', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ERROR HANDLERS
// ============================================================
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

// ============================================================
// START SERVER
// ============================================================
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