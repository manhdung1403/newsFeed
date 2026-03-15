const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Sử dụng Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);

// Error Handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Lỗi server!' });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});