const MessageModel = require('../models/messageModel');
const ConversationModel = require('../models/conversationModel');
const { onlineUsers } = require('../utils/socket');

class ChatController {
    static async getMessages(req, res) {
        try {
            const senderId = req.session.userId;
            const receiverId = req.params.receiverId;
            const messages = await MessageModel.getMessagesBetweenUsers(senderId, receiverId);
            res.json(messages);
        } catch (err) { res.status(500).json({ error: err.message }); }
    }

    static async getConversations(req, res) {
        try {
            const userId = req.session.userId;
            const conversations = await ConversationModel.getConversationsForUser(userId);
            const rows = conversations.map(r => ({
                ...r,
                other_is_online: onlineUsers.has(String(r.other_id))
            }));
            res.json(rows);
        } catch (err) { res.status(500).json({ error: err.message }); }
    }

    static async getConversationMessages(req, res) {
        try {
            const convId = parseInt(req.params.id, 10);
            const messages = await MessageModel.getMessagesInConversation(convId);
            res.json(messages);
        } catch (err) { res.status(500).json({ error: err.message }); }
    }

    static async createConversation(req, res) {
        try {
            const { participantIds, title } = req.body;
            const result = await ConversationModel.createConversation(participantIds, title, req.session.userId);
            res.json({ success: true, ...result });
        } catch (err) { res.status(500).json({ error: err.message }); }
    }

    static async getConversationParticipants(req, res) {
        try {
            const convId = parseInt(req.params.id, 10);
            const participants = await ConversationModel.getParticipants(convId);
            const rows = participants.map(u => ({
                ...u,
                is_online: onlineUsers.has(String(u.id))
            }));
            res.json(rows);
        } catch (err) { res.status(500).json({ error: err.message }); }
    }

    static async deleteConversation(req, res) {
        try {
            const convId = parseInt(req.params.id, 10);
            const userId = req.session.userId;
            const isInConv = await ConversationModel.isUserInConversation(convId, userId);
            if (!isInConv) {
                return res.status(403).json({ error: 'Không có quyền xóa' });
            }
            await ConversationModel.deleteConversation(convId);
            // Note: socket emit should be handled in socket.js or here, but since it's in socket, maybe adjust
            res.json({ success: true });
        } catch (err) {
            console.error('Delete conversation error', err);
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = ChatController;