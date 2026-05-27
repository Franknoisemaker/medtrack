import { describe, it, expect, vi } from 'vitest';
import { sanitizePayload, logEvent, logError } from './telemetry';

// Direct HMAC SHA-256 JWT verifier in pure Web Crypto (100% portable)
async function verifyHmacJwt(token: string, secret: string): Promise<any> {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  
  const encoder = new TextEncoder();
  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const keyData = encoder.encode(secret);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  
  const base64UrlDecode = (str: string) => {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return atob(base64);
  };
  
  const sigStr = base64UrlDecode(signatureB64);
  const sigBuf = new Uint8Array(sigStr.length);
  for (let i = 0; i < sigStr.length; i++) sigBuf[i] = sigStr.charCodeAt(i);
  
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBuf,
    data
  );
  
  if (!isValid) {
    throw new Error('Invalid JWT Signature');
  }
  
  return JSON.parse(base64UrlDecode(payloadB64));
}

// Local clone of the Edge Function token generator for direct Vitest testing
async function generatePatientToken(consultaId: string, secret: string, expiresOffset = 24 * 60 * 60): Promise<string> {
  const encoder = new TextEncoder();
  
  const base64UrlEncode = (buf: Uint8Array) => {
    const binString = String.fromCharCode(...buf);
    return btoa(binString)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };
  
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: consultaId,
    jti: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + expiresOffset,
    iat: Math.floor(Date.now() / 1000),
  };
  
  const headerStr = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadStr = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  
  const data = encoder.encode(`${headerStr}.${payloadStr}`);
  const keyData = encoder.encode(secret);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signatureBuf = await crypto.subtle.sign('HMAC', key, data);
  const signatureStr = base64UrlEncode(new Uint8Array(signatureBuf));
  
  return `${headerStr}.${payloadStr}.${signatureStr}`;
}

describe('Telemetry Service - Anti-PHI Sanitization', () => {
  it('should sanitize first-level properties on the PHI blacklist', () => {
    const input = {
      nombre: 'Dr. Gregory House',
      cedula: '12345678',
      email: 'house@medtrack.mx',
      session_id: 'abc-123-xyz',
      timestamp: '2026-05-23T16:00:00Z',
    };

    const output = sanitizePayload(input);

    expect(output.nombre).toBe('[REDACTED_PHI]');
    expect(output.cedula).toBe('[REDACTED_PHI]');
    expect(output.email).toBe('[REDACTED_PHI]');
    expect(output.session_id).toBe('abc-123-xyz');
    expect(output.timestamp).toBe('2026-05-23T16:00:00Z');
  });

  it('should sanitize recursively inside nested objects and arrays', () => {
    const input = {
      event_type: 'consultation_signed',
      meta: {
        medico: {
          nombre: 'Dr. Gregory House',
          firma_electronica: 'sha256-hash-signature',
        },
        paciente: {
          nombre: 'John Doe',
          padecimientos_cifrado: 'crypted-allergies-data',
        },
        somatometria: {
          peso_kg: 82.5,
          talla_cm: 180,
          imc: 25.4,
          presion: '120/80',
        },
      },
      tags: ['clinical', 'signed'],
    };

    const output = sanitizePayload(input);

    expect(output.event_type).toBe('consultation_signed');
    expect(output.tags).toEqual(['clinical', 'signed']);
    expect(output.meta.medico.nombre).toBe('[REDACTED_PHI]');
    expect(output.meta.medico.firma_electronica).toBe('[REDACTED_PHI]');
    expect(output.meta.paciente.nombre).toBe('[REDACTED_PHI]');
    expect(output.meta.paciente.padecimientos_cifrado).toBe('[REDACTED_PHI]');
    expect(output.meta.somatometria.peso_kg).toBe('[REDACTED_PHI]');
    expect(output.meta.somatometria.talla_cm).toBe('[REDACTED_PHI]');
    expect(output.meta.somatometria.imc).toBe('[REDACTED_PHI]');
    expect(output.meta.somatometria.presion).toBe('120/80');
  });

  it('should handle case insensitivity and partial matching of blacklist keys', () => {
    const input = {
      Patient_Nombre_Completo: 'Jane Doe',
      subjetivo_cifrado: 'Subjetivo Clinico',
      Plan_de_Tratamiento: 'Plan Medico',
    };

    const output = sanitizePayload(input);

    expect(output.Patient_Nombre_Completo).toBe('[REDACTED_PHI]');
    expect(output.subjetivo_cifrado).toBe('[REDACTED_PHI]');
    expect(output.Plan_de_Tratamiento).toBe('[REDACTED_PHI]');
  });

  it('should safely execute logEvent and return sanitized payload', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const payload = {
      nombre: 'Jane Doe',
      timestamp: '2026-05-23T16:00:00Z',
    };

    const result = logEvent('user_login', payload);

    expect(result.nombre).toBe('[REDACTED_PHI]');
    expect(result.timestamp).toBe('2026-05-23T16:00:00Z');
    expect(consoleInfoSpy).toHaveBeenCalled();

    consoleInfoSpy.mockRestore();
  });

  it('should safely execute logError and return sanitized context', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const error = new Error('Database insertion failed');
    const context = {
      nombre_paciente: 'Jane Doe',
      query_type: 'INSERT',
    };

    const result = logError(error, context);

    expect(result.errorName).toBe('Error');
    expect(result.errorMessage).toBe('Database insertion failed');
    expect(result.context.nombre_paciente).toBe('[REDACTED_PHI]');
    expect(result.context.query_type).toBe('INSERT');
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

describe('Single-Use JWT Patient Token Generation', () => {
  const secret = 'super-secret-patient-jwt-signature-key-change-me';
  const consultaId = '550e8400-e29b-41d4-a716-446655440000';

  it('should generate a valid HS256 signed JWT token', async () => {
    const token = await generatePatientToken(consultaId, secret);
    
    expect(token).toBeDefined();
    expect(token.split('.').length).toBe(3);

    const payload = await verifyHmacJwt(token, secret);
    expect(payload.sub).toBe(consultaId);
    expect(payload.jti).toBeDefined();
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('should generate unique JTIs for consecutive token creations', async () => {
    const tokenA = await generatePatientToken(consultaId, secret);
    const tokenB = await generatePatientToken(consultaId, secret);

    const payloadA = await verifyHmacJwt(tokenA, secret);
    const payloadB = await verifyHmacJwt(tokenB, secret);

    expect(payloadA.jti).not.toBe(payloadB.jti);
  });
});

describe('Patient Auth-Gate - Replay and Lockout Protection', () => {
  const secret = 'super-secret-patient-jwt-signature-key-change-me';
  const consultaId = '550e8400-e29b-41d4-a716-446655440000';
  
  // Simulated database collections for Auth-Gate tests
  const jtiUsedSet = new Set<string>();
  const mockConsultationTable = {
    id: consultaId,
    telefono: '5512345678',
    fecha_nacimiento: '1990-05-15',
    intentos_fallidos: 0,
    auth_blocked_until: null as string | null,
    status: 'PENDING_ONBOARDING',
  };

  // Auth gate runner clone matching Edge Function implementation exactly
  async function runAuthGate(body: { token: string; fecha_nacimiento: string; telefono: string }) {
    const { token, fecha_nacimiento, telefono } = body;

    // 1. Verify token signature
    let payload;
    try {
      payload = await verifyHmacJwt(token, secret);
    } catch {
      return { success: false, error: 'TOKEN_INVALID' };
    }

    // Check expiration
    if (payload.exp < Date.now() / 1000) {
      return { success: false, error: 'TOKEN_EXPIRED' };
    }

    const tokenJti = payload.jti;

    // 2. Prevent Replay Attack
    if (jtiUsedSet.has(tokenJti)) {
      return { success: false, error: 'TOKEN_ALREADY_USED' };
    }

    // 3. Lockout check
    if (mockConsultationTable.auth_blocked_until) {
      if (new Date(mockConsultationTable.auth_blocked_until) > new Date()) {
        return { success: false, error: 'AUTH_BLOCKED' };
      }
    }

    // 4. Validate credentials
    const cleanDbPhone = mockConsultationTable.telefono.replace(/\D/g, '').slice(-10);
    const cleanInputPhone = telefono.replace(/\D/g, '').slice(-10);
    
    let isMatch = cleanDbPhone === cleanInputPhone;
    if (isMatch && fecha_nacimiento) {
      isMatch = mockConsultationTable.fecha_nacimiento === fecha_nacimiento;
    }

    if (!isMatch) {
      mockConsultationTable.intentos_fallidos += 1;
      if (mockConsultationTable.intentos_fallidos >= 3) {
        mockConsultationTable.auth_blocked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        mockConsultationTable.intentos_fallidos = 0;
        return { success: false, error: 'AUTH_BLOCKED' };
      }
      return { success: false, error: 'INVALID_CREDENTIALS', attempts_remaining: 3 - mockConsultationTable.intentos_fallidos };
    }

    // Success - reset attempts
    mockConsultationTable.intentos_fallidos = 0;
    mockConsultationTable.auth_blocked_until = null;

    // Record JTI as used (prevent replay)
    jtiUsedSet.add(tokenJti);

    return { success: true, consulta_id: consultaId };
  }

  it('should authenticate correctly on first try with valid credentials', async () => {
    const token = await generatePatientToken(consultaId, secret);
    const result = await runAuthGate({
      token,
      fecha_nacimiento: '1990-05-15',
      telefono: '5512345678',
    });

    expect(result.success).toBe(true);
    expect(result.consulta_id).toBe(consultaId);
  });

  it('should reject immediate replay attempt with the same token', async () => {
    const token = await generatePatientToken(consultaId, secret);
    
    // First try (should succeed)
    const resultA = await runAuthGate({
      token,
      fecha_nacimiento: '1990-05-15',
      telefono: '5512345678',
    });
    expect(resultA.success).toBe(true);

    // Replay attempt with same token (should fail)
    const resultB = await runAuthGate({
      token,
      fecha_nacimiento: '1990-05-15',
      telefono: '5512345678',
    });
    expect(resultB.success).toBe(false);
    expect(resultB.error).toBe('TOKEN_ALREADY_USED');
  });

  it('should enforce 15-minute security lockout after 3 incorrect credential attempts', async () => {
    // Reset lockout state
    mockConsultationTable.intentos_fallidos = 0;
    mockConsultationTable.auth_blocked_until = null;

    const token = await generatePatientToken(consultaId, secret);

    // Attempt 1: Fail
    const res1 = await runAuthGate({ token, fecha_nacimiento: '1990-05-15', telefono: '0000000000' });
    expect(res1.success).toBe(false);
    expect(res1.error).toBe('INVALID_CREDENTIALS');
    expect(res1.attempts_remaining).toBe(2);

    // Attempt 2: Fail
    const res2 = await runAuthGate({ token, fecha_nacimiento: '1990-05-15', telefono: '0000000000' });
    expect(res2.success).toBe(false);
    expect(res2.error).toBe('INVALID_CREDENTIALS');
    expect(res2.attempts_remaining).toBe(1);

    // Attempt 3: Triggers Lockout
    const res3 = await runAuthGate({ token, fecha_nacimiento: '1990-05-15', telefono: '0000000000' });
    expect(res3.success).toBe(false);
    expect(res3.error).toBe('AUTH_BLOCKED');

    // Attempt 4 (Correct credentials but currently blocked)
    const res4 = await runAuthGate({ token, fecha_nacimiento: '1990-05-15', telefono: '5512345678' });
    expect(res4.success).toBe(false);
    expect(res4.error).toBe('AUTH_BLOCKED');
  });
});
