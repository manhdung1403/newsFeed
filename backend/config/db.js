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

const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log('Connected to SQL Server');
        return pool;
    })
    .catch(err => {
        console.error('Database Connection Failed: ', err);
        process.exit(1);
    });

module.exports = { sql, poolPromise };