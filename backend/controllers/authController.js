const bcrypt = require('bcrypt');
const UserModel = require('../models/userModel');

class AuthController {
    static async register(req, res) {
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

            const existingUser = await UserModel.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({ error: 'Email đã được sử dụng' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await UserModel.createUser(username, email, hashedPassword, dob);
            req.session.userId = newUser.id;
            req.session.username = newUser.username;
            res.json({ success: true, message: 'Đăng ký thành công', user: newUser });
        } catch (err) {
            console.error('Lỗi đăng ký:', err);
            res.status(500).json({ error: 'Lỗi server: ' + err.message });
        }
    }

    static async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
            }

            const user = await UserModel.findByEmail(email);
            if (!user) {
                return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
            }

            const match = await bcrypt.compare(password, user.password);
            if (!match) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

            req.session.userId = user.id;
            req.session.username = user.username;
            res.json({ success: true, message: 'Đăng nhập thành công', user: { id: user.id, username: user.username, email: user.email } });
        } catch (err) {
            console.error('Lỗi đăng nhập:', err);
            res.status(500).json({ error: 'Lỗi server: ' + err.message });
        }
    }

    static async logout(req, res) {
        const userId = req.session && req.session.userId;
        if (userId) {
            try {
                await UserModel.updateLastSeen(userId);
            } catch (e) { console.error('logout last_seen error', e); }
        }
        req.session.destroy((err) => {
            if (err) return res.status(500).json({ error: 'Lỗi khi đăng xuất' });
            res.json({ success: true, message: 'Đăng xuất thành công' });
        });
    }

    static getStatus(req, res) {
        if (req.session && req.session.userId) {
            res.json({ loggedIn: true, user: { id: req.session.userId, username: req.session.username } });
        } else {
            res.json({ loggedIn: false });
        }
    }
}

module.exports = AuthController;