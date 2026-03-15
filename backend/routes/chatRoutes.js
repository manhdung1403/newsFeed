const express = require('express');
const ChatController = require('../controllers/chatController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/messages/:receiverId', requireAuth, ChatController.getMessages);
router.get('/conversations', requireAuth, ChatController.getConversations);
router.get('/conversations/:id/messages', requireAuth, ChatController.getConversationMessages);
router.post('/conversations', requireAuth, ChatController.createConversation);
router.get('/conversations/:id/participants', requireAuth, ChatController.getConversationParticipants);
router.delete('/conversations/:id', requireAuth, ChatController.deleteConversation);

module.exports = router;