// Shared CORS helper for Supabase Edge Functions
// Uses globalThis checks to prevent IDE/TypeScript errors in shared monorepos

const DenoEnv = (globalThis as any).Deno?.env;
const allowedOrigin = DenoEnv ? DenoEnv.get('ALLOWED_ORIGIN') : null;

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 204,
      headers: corsHeaders,
    })
  }
  return null;
}
