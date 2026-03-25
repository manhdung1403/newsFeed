function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ error: 'Chưa đăng nhập' });
}

module.exports = requireAuth;
