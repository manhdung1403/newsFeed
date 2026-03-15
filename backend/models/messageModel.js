const { sql, dbConfig } = require('../config/database');

class MessageModel {
    static async getMessagesBetweenUsers(senderId, receiverId) {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('sId', sql.Int, senderId)
            .input('rId', sql.Int, receiverId)
            .query(`SELECT * FROM Messages 
                    WHERE (sender_id = @sId AND receiver_id = @rId) 
                    OR (sender_id = @rId AND receiver_id = @sId) 
                    ORDER BY created_at ASC`);
        return result.recordset;
    }

    static async getMessagesInConversation(conversationId) {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('convId', sql.Int, conversationId)
            .query(`SELECT m.id, m.sender_id, m.receiver_id, m.message_text as text, m.reply_to_id as reply_to, m.image_url, m.created_at, m.seen, m.reaction
                    FROM Messages m
                    WHERE m.conversation_id = @convId
                    ORDER BY m.created_at ASC`);
        return result.recordset;
    }
}

module.exports = MessageModel;