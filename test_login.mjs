import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  if (stored.startsWith('sha256:')) {
    const [, salt, expected] = stored.split(':');
    const actual = crypto.createHash('sha256').update(salt + String(password)).digest('hex');
    return actual === expected;
  }
  return false;
}

const newToken = () => crypto.randomBytes(32).toString('hex');
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const now = () => Date.now();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function testLogin(email, password) {
  try {
    const rows = await sql`
      SELECT u.*, sh.name AS shop_name
      FROM users u
      LEFT JOIN shops sh ON sh.id = u.shop_id
      WHERE u.email = ${email}
      LIMIT 1
    `;
    console.log('User found:', rows[0]?.email);
    const user = rows[0];
    const ok = verifyPassword(password, user.password_hash);
    console.log('Password verified:', ok);

    console.log('Deleting expired sessions...');
    await sql`DELETE FROM sessions WHERE expires_at < ${now()}`;

    const token = newToken();
    console.log('Inserting session...');
    await sql`
      INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
      VALUES (${tokenHash(token)}, ${user.id}, ${now()}, ${now() + SESSION_TTL_MS})
    `;
    console.log('Session inserted successfully!');
  } catch (err) {
    console.error('ERROR during login test:', err);
  }
}

testLogin('shop1@click.et', 'Shop@123');

