const mysql = require('mysql2/promise'); // <-- ¡Esto es crucial para que use promesas!

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'root', 
  database: 'bot_pokemon',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;