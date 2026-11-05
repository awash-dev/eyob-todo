export const config = {
  runtime: 'edge',
}

export default async function handler(req: any, res?: any): Promise<Response | void> {
  // Support both Edge Runtime (Fetch API Request) and Node.js Serverless Function (IncomingMessage, ServerResponse)
  const isWeb = typeof req?.headers?.get === 'function'

  const getHeader = (name: string): string | null => {
    if (isWeb) {
      return req.headers.get(name) || req.headers.get(name.toLowerCase()) || null
    }
    const val = req.headers?.[name] || req.headers?.[name.toLowerCase()]
    return Array.isArray(val) ? val[0] : (val || null)
  }

  const origin = getHeader('origin') || '*'
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers':
      'Content-Type, Neon-Connection-String, Neon-Raw-Text-Output, Neon-Array-Mode, Authorization, neon-connection-string, neon-raw-text-output, neon-array-mode, content-type',
    'Access-Control-Allow-Credentials': 'true',
  }

  const method = isWeb ? req.method : req?.method

  if (method === 'OPTIONS') {
    if (isWeb) {
      return new Response(null, { status: 204, headers: corsHeaders })
    } else if (res) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))
      res.status(204).end()
      return
    }
  }

  if (method !== 'POST') {
    if (isWeb) {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
    } else if (res) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))
      res.status(405).send('Method Not Allowed')
      return
    }
  }

  let bodyText = ''
  try {
    if (isWeb) {
      bodyText = await req.text()
    } else if (typeof req?.body === 'string') {
      bodyText = req.body
    } else if (req?.body && typeof req.body === 'object') {
      bodyText = JSON.stringify(req.body)
    } else if (req && typeof req.on === 'function') {
      bodyText = await new Promise<string>((resolve, reject) => {
        let data = ''
        req.on('data', (chunk: any) => {
          data += chunk
        })
        req.on('end', () => resolve(data))
        req.on('error', reject)
      })
    }
  } catch (err: any) {
    console.error('Error reading request body in /api/sql proxy:', err)
  }

  const rawConnStr =
    getHeader('neon-connection-string') ||
    getHeader('Neon-Connection-String') ||
    (typeof process !== 'undefined' ? process.env?.DATABASE_URL || process.env?.VITE_DATABASE_URL : undefined) ||
    'postgresql://neondb_owner:npg_OtyTj7F9Aqnz@ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require'

  try {
    const url = new URL(rawConnStr)
    // Extract base endpoint (remove -pooler to use direct HTTP /sql)
    const host = url.hostname.replace('-pooler', '')
    const targetUrl = `https://${host}/sql`

    const forwardHeaders: Record<string, string> = {
      'content-type': 'application/json',
      'neon-connection-string': rawConnStr,
    }

    const rawTextHeader = getHeader('neon-raw-text-output')
    if (rawTextHeader) forwardHeaders['neon-raw-text-output'] = rawTextHeader

    const arrayModeHeader = getHeader('neon-array-mode')
    if (arrayModeHeader) forwardHeaders['neon-array-mode'] = arrayModeHeader

    const upstreamRes = await fetch(targetUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: bodyText,
    })

    const upstreamContentType = upstreamRes.headers.get('content-type') || 'application/json'
    const upstreamBytes = await upstreamRes.arrayBuffer()

    if (isWeb) {
      return new Response(upstreamBytes, {
        status: upstreamRes.status,
        headers: {
          ...corsHeaders,
          'content-type': upstreamContentType,
        },
      })
    } else if (res) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))
      res.setHeader('content-type', upstreamContentType)
      res.status(upstreamRes.status).send(Buffer.from(upstreamBytes))
      return
    }
  } catch (err: any) {
    console.error('Neon SQL proxy error:', err)
    const errBody = JSON.stringify({ message: err?.message || 'Database proxy error' })
    if (isWeb) {
      return new Response(errBody, {
        status: 500,
        headers: {
          ...corsHeaders,
          'content-type': 'application/json',
        },
      })
    } else if (res) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))
      res.setHeader('content-type', 'application/json')
      res.status(500).send(errBody)
      return
    }
  }
}
