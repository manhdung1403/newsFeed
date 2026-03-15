const { sql, dbConfig } = require('../config/database');

class UserModel {
    static async findByEmail(email) {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT id, username, email, password FROM Users WHERE email = @email');
        return result.recordset[0];
    }

    static async createUser(username, email, password, dob) {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input('username', sql.NVarChar, username)
            .input('email', sql.VarChar, email)
            .input('password', sql.VarChar, password)
            .input('dob', sql.Date, dob)
            .query(`INSERT INTO Users (username, email, password, dob) 
                    OUTPUT INSERTED.id, INSERTED.username, INSERTED.email
                    VALUES (@username, @email, @password, @dob)`);
        return result.recordset[0];
    }

    static async updateLastSeen(userId) {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('uid', sql.Int, userId)
            .query(`UPDATE Users SET last_seen = GETDATE() WHERE id = @uid`);
    }

    static async getAllUsers(excludeUserId) {
        let pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('me', sql.Int, excludeUserId)
            .query(`SELECT u.id, u.username, u.avatar,
                CASE WHEN f.follower_id IS NULL THEN 0 ELSE 1 END AS is_following
                FROM Users u
                LEFT JOIN Follows f ON f.following_id = u.id AND f.follower_id = @me
                WHERE u.id <> @me`);
        return result.recordset;
    }

    static async followUser(followerId, followingId) {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('me', sql.Int, followerId)
            .input('userId', sql.Int, followingId)
            .query(`IF NOT EXISTS (SELECT 1 FROM Follows WHERE follower_id=@me AND following_id=@userId)
                INSERT INTO Follows (follower_id, following_id) VALUES (@me, @userId)`);
    }

    static async unfollowUser(followerId, followingId) {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('me', sql.Int, followerId)
            .input('userId', sql.Int, followingId)
            .query(`DELETE FROM Follows WHERE follower_id=@me AND following_id=@userId`);
    }
}

module.exports = UserModel;