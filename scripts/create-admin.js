require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

async function bootstrapAdmin() {
  const username = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || 'ChangeMe123!');

  if (!username || !password) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be set in the environment.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `
      INSERT INTO admin_users (username, password_hash)
      VALUES ($1, $2)
      ON CONFLICT (username)
      DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id, username
    `,
    [username, passwordHash]
  );

  console.log(`Admin user ready: ${result.rows[0].username}`);
  await pool.end();
}

bootstrapAdmin().catch((error) => {
  console.error('Failed to bootstrap admin user:', error.message);
  process.exit(1);
});
