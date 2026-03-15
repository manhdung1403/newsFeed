const { poolPromise, sql } = require('../config/db');

const User = {
    findByEmail: async (email) => {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT * FROM Users WHERE email = @email');
        return result.recordset[0];
    },
    create: async (username, email, password, dob) => {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('username', sql.NVarChar, username)
            .input('email', sql.VarChar, email)
            .input('password', sql.VarChar, password)
            .input('dob', sql.Date, dob)
            .query(`INSERT INTO Users (username, email, password, dob) 
                    OUTPUT INSERTED.id, INSERTED.username, INSERTED.email
                    VALUES (@username, @email, @password, @dob)`);
        return result.recordset[0];
    }
};
module.exports = User;