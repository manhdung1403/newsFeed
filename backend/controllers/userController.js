const UserModel = require('../models/userModel');

class UserController {
    static async getUsers(req, res) {
        try {
            const users = await UserModel.getAllUsers(req.session.userId);
            res.json(users);
        } catch (err) { res.status(500).json({ error: err.message }); }
    }

    static async followUser(req, res) {
        try {
            const me = req.session.userId;
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: 'userId required' });
            await UserModel.followUser(me, userId);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    }

    static async unfollowUser(req, res) {
        try {
            const me = req.session.userId;
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: 'userId required' });
            await UserModel.unfollowUser(me, userId);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    }
}

module.exports = UserController;