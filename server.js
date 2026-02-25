const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.urlencoded({ extended: true }));

// Cấu hình session
app.use(session({
    secret: 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set true nếu dùng HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 giờ
    }
}));

// Serve static files từ thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// Cấu hình thông số SQL Server của bạn
const dbConfig = {
    user: 'sa',
    password: '0944364247',
    server: 'localhost',
    port: 64957,
    database: 'newsFeedDb',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

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
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
        }

        let pool = await sql.connect(dbConfig);
        
        // Kiểm tra email đã tồn tại chưa
        let checkResult = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT id FROM Users WHERE email = @email');
        
        if (checkResult.recordset.length > 0) {
            return res.status(400).json({ error: 'Email đã được sử dụng' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Tạo user mới
        let result = await pool.request()
            .input('username', sql.NVarChar, username)
            .input('email', sql.VarChar, email)
            .input('password', sql.VarChar, hashedPassword)
            .query(`INSERT INTO Users (username, email, password) 
                    OUTPUT INSERTED.id, INSERTED.username, INSERTED.email
                    VALUES (@username, @email, @password)`);

        const newUser = result.recordset[0];
        
        // Tạo session
        req.session.userId = newUser.id;
        req.session.username = newUser.username;
        
        res.json({ 
            success: true, 
            message: 'Đăng ký thành công',
            user: { id: newUser.id, username: newUser.username, email: newUser.email }
        });
    } catch (err) {
        console.error('Lỗi đăng ký:', err);
        res.status(500).json({ error: "Lỗi server: " + err.message });
    }
});

// API đăng nhập
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
        }

        let pool = await sql.connect(dbConfig);
        
        // Tìm user theo email
        let result = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT id, username, email, password FROM Users WHERE email = @email');
        
        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
        }

        const user = result.recordset[0];
        
        // Kiểm tra password
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
        }

        // Tạo session
        req.session.userId = user.id;
        req.session.username = user.username;
        
        res.json({ 
            success: true, 
            message: 'Đăng nhập thành công',
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (err) {
        console.error('Lỗi đăng nhập:', err);
        res.status(500).json({ error: "Lỗi server: " + err.message });
    }
});

// API đăng xuất
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Lỗi khi đăng xuất' });
        }
        res.json({ success: true, message: 'Đăng xuất thành công' });
    });
});

// API kiểm tra trạng thái đăng nhập
app.get('/api/auth/status', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ 
            loggedIn: true, 
            user: { 
                id: req.session.userId, 
                username: req.session.username 
            } 
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// API lấy posts (chỉ khi đã đăng nhập)
app.get('/api/posts', requireAuth, async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT p.id, p.image_url, p.caption, p.created_at, u.id as user_id, u.username
            FROM Posts p
            LEFT JOIN Users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send("Lỗi server: " + err.message);
    }
});

const PORT = 3000;
app.listen(PORT, async () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    
    try {
        // Thử kết nối ngay khi khởi động
        let pool = await sql.connect(dbConfig);
        if (pool.connected) {
            console.log("✅ Chúc mừng! Đã kết nối SQL Server thành công.");
        }
    } catch (err) {
        console.error("❌ Lỗi kết nối Database rồi:");
        console.error("--- Chi tiết lỗi ---");
        console.error(err.message);
        console.error("--------------------");
    }
});