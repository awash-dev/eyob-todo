import { handleApi, ensureSchema, HttpError, json } from '../server/index.mjs'

let isSchemaReady = false

export default async function handler(req, res) {
  const origin = req.headers.origin
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  if (origin) {
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (!isSchemaReady) {
    try {
      await ensureSchema()
    } catch (e) {
      console.warn('Vercel schema ensure warning:', e?.message || e)
    }
    isSchemaReady = true
  }

  const url = new URL(req.url || '/', `https://${req.headers['x-forwarded-host'] || req.headers.host || 'localhost'}`)

  try {
    await handleApi(req, res, url)
  } catch (error) {
    if (res.headersSent) {
      res.end()
      return
    }
    if (error instanceof HttpError) {
      json(res, error.status, { error: error.message })
      return
    }
    console.error('Unhandled Vercel API error:', error)
    json(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}

