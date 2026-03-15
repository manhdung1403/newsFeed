const express = require('express');
const PostController = require('../controllers/postController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, PostController.getPosts);
router.post('/', requireAuth, PostController.createPost);
router.post('/:id/like', requireAuth, PostController.toggleLike);

module.exports = router;