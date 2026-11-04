import { defineConfig, loadEnv, type Plugin } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { neon } from '@neondatabase/serverless'

function neonSqlProxyPlugin(dbUrl: string): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Neon-Connection-String, Neon-Raw-Text-Output, Neon-Array-Mode',
    )

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    if (!dbUrl) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ message: 'DATABASE_URL is not configured on the server' }))
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))

    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        query?: string
        params?: unknown[]
        queries?: Array<{ query: string; params?: unknown[] }>
      }
      const sql = neon(dbUrl)

      let result: unknown
      if (payload.queries) {
        const results = []
        for (const item of payload.queries) {
          results.push(await sql.query(item.query, item.params ?? [], { arrayMode: true, fullResults: true }))
        }
        result = { results }
      } else {
        if (!payload.query) throw new Error('Missing SQL query')
        result = await sql.query(payload.query, payload.params ?? [], { arrayMode: true, fullResults: true })
      }

      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (error) {
      res.statusCode = 400
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ message: error instanceof Error ? error.message : 'SQL request failed' }))
    }
  }

  return {
    name: 'neon-sql-proxy',
    configureServer(server) {
      server.middlewares.use('/api/sql', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/sql', handler)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const dbUrl = env.DATABASE_URL || process.env.DATABASE_URL || ''

  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      neonSqlProxyPlugin(dbUrl),
      tailwindcss(),
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      viteReact(),
    ],
    server: { port: 3000, cors: true },
  }
})
