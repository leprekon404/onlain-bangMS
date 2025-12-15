// gen-hash.js
const bcrypt = require('bcryptjs');

async function run() {
  const password = 'Password123!';       // здесь нужный пароль
  const saltRounds = 12;                 // "стоимость" bcrypt

  const hash = await bcrypt.hash(password, saltRounds);
  console.log('Пароль:', password);
  console.log('Хеш:   ', hash);
}

run().catch(console.error);
