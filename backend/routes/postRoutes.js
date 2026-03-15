const express = require('express');
const router = express.Router();
const postCtrl = require('../controllers/postController');
const requireAuth = require('../middleware/authMiddleware');

router.get('/', requireAuth, postCtrl.getPosts);
router.post('/', requireAuth, postCtrl.createPost);
router.post('/:id/like', requireAuth, postCtrl.likePost);

module.exports = router;