const express = require('express');
const UserController = require('../controllers/userController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, UserController.getUsers);
router.post('/follow', requireAuth, UserController.followUser);
router.post('/unfollow', requireAuth, UserController.unfollowUser);

module.exports = router;