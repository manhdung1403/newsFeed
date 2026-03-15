const PostModel = require('../models/postModel');

class PostController {
    static async getPosts(req, res) {
        try {
            const posts = await PostModel.getAllPosts(req.session.userId);
            res.json(posts);
        } catch (err) {
            res.status(500).json({ error: 'Lỗi server: ' + err.message });
        }
    }

    static async createPost(req, res) {
        try {
            const { image_url, caption } = req.body;
            const userId = req.session.userId;

            if (!image_url) {
                return res.status(400).json({ error: 'URL ảnh là bắt buộc' });
            }

            const post = await PostModel.createPost(userId, image_url, caption);
            res.json({ success: true, message: 'Bài đăng đã được tạo thành công', post });
        } catch (err) {
            console.error('Lỗi tạo bài đăng:', err);
            res.status(500).json({ error: 'Lỗi server: ' + err.message });
        }
    }

    static async toggleLike(req, res) {
        try {
            const postId = parseInt(req.params.id, 10);
            const userId = req.session.userId;

            if (isNaN(postId)) return res.status(400).json({ error: 'ID bài viết không hợp lệ' });

            const result = await PostModel.toggleLike(postId, userId);
            res.json({ success: true, ...result });
        } catch (err) {
            console.error('Lỗi toggle tim:', err);
            res.status(500).json({ error: 'Lỗi server: ' + err.message });
        }
    }
}

module.exports = PostController;