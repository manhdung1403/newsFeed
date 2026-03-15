const { sql, dbConfig } = require('../config/database');

class PostModel {
    static async getAllPosts(userId) {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('currentUserId', sql.Int, userId)
            .query(`
                SELECT 
                    p.id, 
                    p.image_url, 
                    p.caption, 
                    p.created_at, 
                    u.id AS user_id, 
                    u.username,
                    ISNULL(lc.like_count, 0) AS like_count,
                    CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_current_user
                FROM Posts p
                LEFT JOIN Users u ON p.user_id = u.id
                LEFT JOIN (
                    SELECT post_id, COUNT(*) AS like_count
                    FROM Likes
                    GROUP BY post_id
                ) lc ON lc.post_id = p.id
                LEFT JOIN Likes ul 
                    ON ul.post_id = p.id AND ul.user_id = @currentUserId
                ORDER BY p.created_at DESC
            `);
        return result.recordset;
    }

    static async createPost(userId, imageUrl, caption) {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('user_id', sql.Int, userId)
            .input('image_url', sql.NVarChar(sql.MAX), imageUrl)
            .input('caption', sql.NVarChar, caption || null)
            .query(`
                INSERT INTO Posts (user_id, image_url, caption, created_at)
                OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.image_url, INSERTED.caption, INSERTED.created_at
                VALUES (@user_id, @image_url, @caption, GETDATE())
            `);
        return result.recordset[0];
    }

    static async toggleLike(postId, userId) {
        let pool = await sql.connect(dbConfig);
        let existing = await pool.request()
            .input('post_id', sql.Int, postId)
            .input('user_id', sql.Int, userId)
            .query(`SELECT id FROM Likes WHERE post_id = @post_id AND user_id = @user_id`);

        let liked;
        if (existing.recordset.length > 0) {
            await pool.request()
                .input('post_id', sql.Int, postId)
                .input('user_id', sql.Int, userId)
                .query(`DELETE FROM Likes WHERE post_id = @post_id AND user_id = @user_id`);
            liked = false;
        } else {
            await pool.request()
                .input('post_id', sql.Int, postId)
                .input('user_id', sql.Int, userId)
                .query(`INSERT INTO Likes (post_id, user_id) VALUES (@post_id, @user_id)`);
            liked = true;
        }

        let countResult = await pool.request()
            .input('post_id', sql.Int, postId)
            .query(`SELECT COUNT(*) AS like_count FROM Likes WHERE post_id = @post_id`);

        return { liked, like_count: countResult.recordset[0].like_count };
    }
}

module.exports = PostModel;