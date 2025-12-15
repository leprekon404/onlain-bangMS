const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'banking_app_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'online_banking_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL подключена');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL ошибка подключения:', err.message);
  });

module.exports = pool;
