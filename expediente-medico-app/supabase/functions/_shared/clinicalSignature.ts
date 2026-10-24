// Server-side clinical signatures (NOM-004). The signing key never leaves the Edge runtime.

export async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns the clinical signing key (JWT_SECRET), the same key sign-note uses.
 * Only the local sandbox may fall back to the development key; production returns null.
 */
export function getClinicalSigningKey(isLocalDev: boolean): string | null {
  const secret = Deno.env.get('JWT_SECRET');
  if (secret) return secret;
  return isLocalDev ? 'medtrack_clinical_secret_key_2026_nom024' : null;
}
