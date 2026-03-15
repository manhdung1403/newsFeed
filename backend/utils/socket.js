const { sql, dbConfig } = require('../config/database');

const onlineUsers = new Map(); // userId => socketId

function initializeSocket(io) {
    io.on('connection', (socket) => {
        console.log(`⚡ Kết nối mới: ${socket.id}`);

        socket.on('register', (userId) => {
            socket.userId = userId;
            onlineUsers.set(String(userId), socket.id);
            io.emit('user_status', { userId, status: 'online', lastSeen: null });
        });

        socket.on('send_message', async (data) => {
            const { senderId, receiverId, text, replyToId, conversationId, imageUrl } = data;
            try {
                const imgParam = (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('data:')) ? null : imageUrl;
                let pool = await sql.connect(dbConfig);
                const result = await pool.request()
                    .input('senderId', sql.Int, senderId)
                    .input('receiverId', sql.Int, receiverId || null)
                    .input('text', sql.NVarChar, text || null)
                    .input('replyId', sql.Int, replyToId || null)
                    .input('convId', sql.Int, conversationId || null)
                    .input('img', sql.VarChar, imgParam)
                    .query(`
                        INSERT INTO Messages (conversation_id, sender_id, receiver_id, message_text, reply_to_id, image_url)
                        OUTPUT INSERTED.id, INSERTED.created_at
                        VALUES (@convId, @senderId, @receiverId, @text, @replyId, @img)
                    `);

                const savedMsg = { ...data, id: result.recordset[0].id, created_at: result.recordset[0].created_at };

                if (conversationId) {
                    await pool.request()
                        .input('convId', sql.Int, conversationId)
                        .input('text', sql.NVarChar, text || null)
                        .query(`UPDATE Conversations SET last_message = @text, last_updated = GETDATE() WHERE id = @convId`);

                    io.to(`conversation_${conversationId}`).emit('receive_message', savedMsg);
                } else {
                    const receiverSocketId = onlineUsers.get(String(receiverId));
                    if (receiverSocketId) io.to(receiverSocketId).emit('receive_message', savedMsg);
                }

                socket.emit('message_sent', savedMsg);
            } catch (err) {
                console.error("Lỗi chat:", err);
            }
        });

        socket.on('read_message', async (data) => {
            try {
                let pool = await sql.connect(dbConfig);
                await pool.request()
                    .input('messageId', sql.Int, data.messageId)
                    .query(`UPDATE Messages SET seen = 1, seen_at = GETDATE() WHERE id = @messageId`);

                const senderSocket = onlineUsers.get(String(data.senderId));
                if (senderSocket) io.to(senderSocket).emit('message_seen', { messageId: data.messageId, by: data.receiverId });
            } catch (err) { console.error(err); }
        });

        socket.on('reaction', async (data) => {
            try {
                let pool = await sql.connect(dbConfig);
                await pool.request()
                    .input('messageId', sql.Int, data.messageId)
                    .input('emoji', sql.NVarChar, data.emoji)
                    .query(`UPDATE Messages SET reaction = @emoji WHERE id = @messageId`);
                io.emit('reaction', data);
            } catch (err) { console.error(err); }
        });

        socket.on('disconnect', async () => {
            if (socket.userId) {
                onlineUsers.delete(String(socket.userId));
                const lastSeenTime = new Date().toISOString();
                try {
                    let pool = await sql.connect(dbConfig);
                    await pool.request()
                        .input('uid', sql.Int, socket.userId)
                        .query(`UPDATE Users SET last_seen = GETDATE() WHERE id = @uid`);
                } catch (e) {
                    console.error('Lỗi cập nhật last_seen:', e);
                }
                io.emit('user_status', { userId: socket.userId, status: 'offline', lastSeen: lastSeenTime });
            }
        });
    });
}

module.exports = { initializeSocket, onlineUsers };