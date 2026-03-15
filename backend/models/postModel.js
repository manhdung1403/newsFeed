const { poolPromise, sql } = require('../config/db');

const Post = {
    getAll: async (currentUserId) => {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('currentUserId', sql.Int, currentUserId)
            .query(`
                SELECT p.*, u.username, 
                ISNULL(lc.like_count, 0) AS like_count,
                CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_current_user
                FROM Posts p
                LEFT JOIN Users u ON p.user_id = u.id
                LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM Likes GROUP BY post_id) lc ON lc.post_id = p.id
                LEFT JOIN Likes ul ON ul.post_id = p.id AND ul.user_id = @currentUserId
                ORDER BY p.created_at DESC`);
        return result.recordset;
    },
    create: async (userId, image_url, caption) => {
        const pool = await poolPromise;
        return await pool.request()
            .input('user_id', sql.Int, userId)
            .input('image_url', sql.NVarChar(sql.MAX), image_url)
            .input('caption', sql.NVarChar, caption)
            .query(`INSERT INTO Posts (user_id, image_url, caption, created_at)
                    OUTPUT INSERTED.* VALUES (@user_id, @image_url, @caption, GETDATE())`);
    },
    toggleLike: async (postId, userId) => {
        const pool = await poolPromise;
        const existing = await pool.request()
            .input('p', sql.Int, postId).input('u', sql.Int, userId)
            .query(`SELECT id FROM Likes WHERE post_id = @p AND user_id = @u`);

        if (existing.recordset.length > 0) {
            await pool.request().input('p', sql.Int, postId).input('u', sql.Int, userId)
                .query(`DELETE FROM Likes WHERE post_id = @p AND user_id = @u`);
            return false;
        } else {
            await pool.request().input('p', sql.Int, postId).input('u', sql.Int, userId)
                .query(`INSERT INTO Likes (post_id, user_id) VALUES (@p, @u)`);
            return true;
        }
    },
    getLikeCount: async (postId) => {
        const pool = await poolPromise;
        const res = await pool.request().input('p', sql.Int, postId)
            .query(`SELECT COUNT(*) AS count FROM Likes WHERE post_id = @p`);
        return res.recordset[0].count;
    }
};
module.exports = Post;