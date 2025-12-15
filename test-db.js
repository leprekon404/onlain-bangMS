// test-db.js
require('dotenv').config();
const db = require('./backend/config/database');

(async () => {
  try {
    const [rows] = await db.query(
      'SELECT user_id, username, email FROM users'
    );
    console.log('USERS FROM NODE:', rows);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();
