const sql = require('mssql');

const dbConfig = {
    user: 'sa',
    password: '0944364247',
    server: 'localhost',
    port: 64957,
    database: 'newsFeedDb',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

module.exports = { dbConfig, sql };