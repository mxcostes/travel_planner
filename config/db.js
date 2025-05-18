// require('dotenv').config();
// const mysql = require('mysql2');

// const db = mysql.createPool({
//     host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
//     user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
//     password: process.env.DB_PASSWORD || process.env.MYSQL_ROOT_PASSWORD,
//     database: process.env.DB_NAME || process.env.MYSQLDATABASE,
//     port: process.env.DB_PORT || process.env.MYSQLPORT || 3306,
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0
// });

require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// For async/await usage:
const db = pool.promise();

module.exports = {
    pool,  // use this in session store
    db     // use this in routes, async logic
};

// db.connect((err) => {
//     if (err) {
//         console.error('❌ MySQL Connection Error:', err);
//         process.exit(1);
//     }
//     console.log('✅ Connected to MySQL Database');
// });

module.exports = db.promise();

// require('dotenv').config();

// const mysql = require('mysql2');

// const db = mysql.createConnection({
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME,
//     port: process.env.DB_PORT || 3306
// });

// db.connect((err) => {
//     if (err) {
//         console.error('❌ MySQL Connection Error:', err);
//         process.exit(1);
//     }
//     console.log('✅ Connected to MySQL Database');
// });

// module.exports = db;