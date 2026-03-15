const { sql, dbConfig } = require('../config/database');

class ConversationModel {
    static async getConversationsForUser(userId) {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT c.id, c.title, c.last_message, c.last_updated,
                    u.id as other_id, u.username as other_name, u.last_seen as other_last_seen
                FROM Conversations c
                JOIN ConversationParticipants cp2 ON cp2.conversation_id = c.id AND cp2.user_id <> @userId
                JOIN Users u ON u.id = cp2.user_id
                WHERE c.id IN (SELECT conversation_id FROM ConversationParticipants WHERE user_id = @userId)
                ORDER BY c.last_updated DESC
            `);
        return result.recordset;
    }

    static async createConversation(participantIds, title, creatorId) {
        let pool = await sql.connect(dbConfig);
        const users = Array.from(new Set([creatorId].concat(participantIds || []))).map(x => parseInt(x, 10));
        const count = users.length;
        const idsList = users.join(',');

        const checkQuery = `
            SELECT cp.conversation_id
            FROM ConversationParticipants cp
            WHERE cp.user_id IN (${idsList})
            GROUP BY cp.conversation_id
            HAVING COUNT(DISTINCT cp.user_id) = ${count}
            AND (SELECT COUNT(*) FROM ConversationParticipants cp2 WHERE cp2.conversation_id = cp.conversation_id) = ${count}
        `;
        const existing = await pool.request().query(checkQuery);
        if (existing.recordset && existing.recordset.length > 0) {
            return { id: existing.recordset[0].conversation_id, existed: true };
        }

        const insert = await pool.request()
            .input('title', sql.NVarChar, title || null)
            .query(`INSERT INTO Conversations (title) OUTPUT INSERTED.id VALUES (@title)`);
        const convId = insert.recordset[0].id;
        for (const u of users) {
            await pool.request()
                .input('convId', sql.Int, convId)
                .input('u', sql.Int, u)
                .query(`INSERT INTO ConversationParticipants (conversation_id, user_id) VALUES (@convId, @u)`);
        }
        return { id: convId, existed: false };
    }

    static async getParticipants(conversationId) {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('convId', sql.Int, conversationId)
            .query(`
                SELECT u.id, u.username, u.last_seen
                FROM ConversationParticipants cp
                JOIN Users u ON cp.user_id = u.id
                WHERE cp.conversation_id = @convId
            `);
        return result.recordset;
    }

    static async deleteConversation(conversationId) {
        let pool = await sql.connect(dbConfig);
        await pool.request().input('convId', sql.Int, conversationId).query(`DELETE FROM Messages WHERE conversation_id = @convId`);
        await pool.request().input('convId', sql.Int, conversationId).query(`DELETE FROM ConversationParticipants WHERE conversation_id = @convId`);
        await pool.request().input('convId', sql.Int, conversationId).query(`DELETE FROM Conversations WHERE id = @convId`);
    }

    static async isUserInConversation(conversationId, userId) {
        let pool = await sql.connect(dbConfig);
        const check = await pool.request()
            .input('convId', sql.Int, conversationId)
            .input('userId', sql.Int, userId)
            .query(`SELECT 1 FROM ConversationParticipants WHERE conversation_id = @convId AND user_id = @userId`);
        return check.recordset.length > 0;
    }
}

module.exports = ConversationModel;