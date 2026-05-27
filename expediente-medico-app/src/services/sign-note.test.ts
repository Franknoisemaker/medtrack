import { describe, it, expect } from 'vitest';

// Replicated pure HMAC logic from sign-note Edge Function for unit testing
const SOAP_PREFIX = 'medtrack-soap-v1';

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(secret: string, message: string): Promise<string> {
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

describe('SOAP Note Signature (sign-note Edge Function)', () => {
  const secret = 'medtrack_test_secret_2026';
  const soapData = { subjetivo: 'Dolor de cabeza', objetivo: 'TA 120/80', analisis: 'J06.9', plan: 'Reposo 48h' };

  it('signature message uses medtrack-soap-v1 prefix', async () => {
    const soapHash = await sha256hex(JSON.stringify(soapData));
    const cedulaHash = await sha256hex('12345678');
    const timestamp = '2026-05-24T00:00:00.000Z';
    const message = `${SOAP_PREFIX}:v1:${timestamp}:${soapHash}:${cedulaHash}`;
    expect(message.startsWith('medtrack-soap-v1:')).toBe(true);
  });

  it('signature is a 64-character hex string (SHA-256)', async () => {
    const soapHash = await sha256hex(JSON.stringify(soapData));
    const cedulaHash = await sha256hex('12345678');
    const message = `${SOAP_PREFIX}:v1:2026-05-24T00:00:00.000Z:${soapHash}:${cedulaHash}`;
    const firma = await hmacSha256(secret, message);
    expect(firma).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(firma)).toBe(true);
  });

  it('same input produces same signature (determinism)', async () => {
    const soapHash = await sha256hex(JSON.stringify(soapData));
    const cedulaHash = await sha256hex('12345678');
    const ts = '2026-05-24T00:00:00.000Z';
    const message = `${SOAP_PREFIX}:v1:${ts}:${soapHash}:${cedulaHash}`;
    const firma1 = await hmacSha256(secret, message);
    const firma2 = await hmacSha256(secret, message);
    expect(firma1).toBe(firma2);
  });

  it('different SOAP content produces different signature (tamper detection)', async () => {
    const hash1 = await sha256hex(JSON.stringify(soapData));
    const hash2 = await sha256hex(JSON.stringify({ ...soapData, plan: 'Referir a especialista' }));
    const cedula = await sha256hex('12345678');
    const ts = '2026-05-24T00:00:00.000Z';
    const firma1 = await hmacSha256(secret, `${SOAP_PREFIX}:v1:${ts}:${hash1}:${cedula}`);
    const firma2 = await hmacSha256(secret, `${SOAP_PREFIX}:v1:${ts}:${hash2}:${cedula}`);
    expect(firma1).not.toBe(firma2);
  });
});
