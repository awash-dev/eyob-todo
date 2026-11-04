
export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin') || '*'
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Neon-Connection-String, Neon-Raw-Text-Output, Neon-Array-Mode, Authorization, neon-connection-string, neon-raw-text-output, neon-array-mode, content-type',
    'Access-Control-Allow-Credentials': 'true',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const dbUrl =
    request.headers.get('neon-connection-string') ||
    request.headers.get('Neon-Connection-String') ||
    process.env.DATABASE_URL ||
    process.env.VITE_DATABASE_URL ||
    'postgresql://neondb_owner:npg_OtyTj7F9Aqnz@ep-red-sea-b5yphk96-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require'

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const url = new URL(dbUrl)
    const response = await fetch(`https://${url.hostname}/sql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'neon-connection-string': dbUrl,
        'neon-raw-text-output': 'true',
        'neon-array-mode': 'true',
      },
      body: await request.text(),
    })

    const bodyBuffer = await response.arrayBuffer()
    return new Response(bodyBuffer, {
      status: response.status,
      headers: {
        ...corsHeaders,
        'content-type': response.headers.get('content-type') || 'application/json',
      },
    })
  } catch (err: any) {
    return Response.json({ message: err?.message || 'Database proxy error' }, { status: 500, headers: corsHeaders })
  }
}
