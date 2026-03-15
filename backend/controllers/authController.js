const User = require('../models/userModel');
const bcrypt = require('bcrypt');

exports.register = async (req, res) => {
    try {
        const { username, email, password, dob } = req.body;
        if (!username || !email || !password || !dob) return res.status(400).json({ error: 'Thiếu thông tin' });

        const existing = await User.findByEmail(email);
        if (existing) return res.status(400).json({ error: 'Email đã tồn tại' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create(username, email, hashedPassword, dob);

        req.session.userId = newUser.id;
        req.session.username = newUser.username;
        res.json({ success: true, user: newUser });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findByEmail(email);
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
        }
        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ success: true, user: { id: user.id, username: user.username } });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.logout = (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
};

exports.getStatus = (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, user: { id: req.session.userId, username: req.session.username } });
    } else {
        res.json({ loggedIn: false });
    }
};