const Post = require('../models/postModel');

exports.getPosts = async (req, res) => {
    try {
        const posts = await Post.getAll(req.session.userId);
        res.json(posts);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createPost = async (req, res) => {
    try {
        const { image_url, caption } = req.body;
        const result = await Post.create(req.session.userId, image_url, caption);
        res.json({ success: true, post: result.recordset[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.likePost = async (req, res) => {
    try {
        const postId = parseInt(req.params.id);
        const liked = await Post.toggleLike(postId, req.session.userId);
        const count = await Post.getLikeCount(postId);
        res.json({ success: true, liked, like_count: count });
    } catch (err) { res.status(500).json({ error: err.message }); }
};