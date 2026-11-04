// Applies db/schema.sql to the Neon database configured in .env.
// Usage: node db/apply-schema.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import dotenv from 'dotenv'
import { neon } from '@neondatabase/serverless'

const here = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(here, '..', '.env') })

const url = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL
if (!url) {
  console.error('No DATABASE_URL / VITE_DATABASE_URL found in .env')
  process.exit(1)
}

const sql = neon(url)
const schema = readFileSync(join(here, 'schema.sql'), 'utf8')

// Strip line comments, then run each statement separately.
// Dollar-quoted bodies (DO $$ ... $$) may contain semicolons, so statement
// splitting must ignore ";" while inside a $$ ... $$ block.
function splitStatements(sqlText) {
  const withoutComments = sqlText
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

  const statements = []
  let current = ''
  let inDollar = false
  for (let i = 0; i < withoutComments.length; i++) {
    const ch = withoutComments[i]
    if (ch === '$' && withoutComments[i + 1] === '$') {
      inDollar = !inDollar
      current += '$$'
      i++
      continue
    }
    if (ch === ';' && !inDollar) {
      if (current.trim()) statements.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) statements.push(current.trim())
  return statements
}

const statements = splitStatements(schema)

try {
  for (const statement of statements) {
    await sql.query(statement)
    console.log('OK:', statement.split('\n')[0].slice(0, 70))
  }

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `
  console.log('\nPublic tables now:', tables.map((t) => t.table_name).join(', '))
} catch (err) {
  console.error('Schema apply failed:', err.message)
  process.exit(1)
}
