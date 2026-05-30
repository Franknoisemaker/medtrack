// Supabase Edge Function: auth-gate
// Validates patient magic link token, enforces single-use JTI, and prevents brute-force login attempts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0';
import { SignJWT, jwtVerify } from 'https://esm.sh/jose@5.2.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

// Helper function to decode and verify JWT in a portable standard way
export async function verifyPatientToken(token: string, secret: string): Promise<any> {
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);
  const { payload } = await jwtVerify(token, secretKey);
  return payload;
}

// Helper to generate a short-lived session token (1h) for the onboarding session
export async function generateSessionToken(consultaId: string, pacienteId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);
  
  return await new SignJWT({
    sub: pacienteId,
    consulta_id: consultaId,
    role: 'clinic_patient',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secretKey);
}

Deno.serve(async (req) => {
  // 1. Handle CORS preflight OPTIONS request
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // 2. Parse and validate request body
    const body = await req.json().catch(() => ({}));
    const { token, fecha_nacimiento, telefono } = body;

    if (!token || !telefono) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'INVALID_PARAMETERS', message: 'Missing token or telefono parameter' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const isLocalDev = !supabaseUrl.startsWith('https://') || 
                       supabaseUrl.includes('localhost') || 
                       supabaseUrl.includes('127.0.0.1');

    let patientSecret = Deno.env.get('JWT_PATIENT_SECRET');
    if (!patientSecret) {
      if (isLocalDev) {
        patientSecret = 'fallback-secret-key-at-least-32-chars-long';
      } else {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'SERVER_CONFIG_ERROR', message: 'System configuration error: patient secure signing key is missing.' } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const clientIp = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || '';

    // 3. Verify the token signature and expiration
    let decodedPayload: any;
    try {
      decodedPayload = await verifyPatientToken(token, patientSecret);
    } catch (err: any) {
      const isExpired = err.code === 'ERR_JWT_EXPIRED' || err.message?.includes('expired');
      
      // Log failed authentication in audit trail
      await supabase.from('audit_logs').insert({
        event_type: 'AUTH_GATE_FAIL',
        details: { reason: isExpired ? 'token_expired' : 'invalid_signature', ip: clientIp },
        ip: clientIp,
        user_agent: userAgent,
      });

      return new Response(
        JSON.stringify({ success: false, error: { code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const consultaId = decodedPayload.sub;
    const jti = decodedPayload.jti;
    const exp = decodedPayload.exp;

    if (!consultaId || !jti) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'TOKEN_INVALID', message: 'Token payload is missing claims' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Check if JTI was already marked as used to prevent Replay Attacks
    const { data: jtiUsed } = await supabase
      .from('jwt_jti_used')
      .select('jti')
      .eq('jti', jti)
      .maybeSingle();

    if (jtiUsed) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'TOKEN_ALREADY_USED' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Fetch consultation and associated patient record
    const { data: consultation, error: fetchError } = await supabase
      .from('consultas')
      .select(`
        id, 
        status, 
        intentos_fallidos, 
        auth_blocked_until, 
        pacientes (
          id, 
          nombre, 
          telefono, 
          fecha_nacimiento
        )
      `)
      .eq('id', consultaId)
      .maybeSingle();

    if (fetchError || !consultation) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'CONSULTATION_NOT_FOUND' } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Check if Consultation is currently blocked
    if (consultation.auth_blocked_until) {
      const blockedUntil = new Date(consultation.auth_blocked_until);
      if (blockedUntil > new Date()) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: { 
              code: 'AUTH_BLOCKED', 
              message: 'El acceso está bloqueado por demasiados intentos fallidos.',
              blocked_until: consultation.auth_blocked_until 
            } 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 7. Check if Consultation is already fully completed
    if (consultation.status === 'COMPLETED') {
      return new Response(
        JSON.stringify({ success: true, data: { status: 'ALREADY_COMPLETED' } }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const patient = (consultation as any).pacientes;
    if (!patient) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'PATIENT_NOT_FOUND' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. Cross-Validate Credentials (Phone and Birthdate)
    const cleanDbPhone = (patient.telefono || '').replace(/\D/g, '').slice(-10);
    const cleanInputPhone = (telefono || '').replace(/\D/g, '').slice(-10);
    
    let isMatch = cleanDbPhone === cleanInputPhone;

    // Check birthdate: if placeholder '1970-01-01', ignore strict check (first onboarding session)
    if (isMatch && fecha_nacimiento && patient.fecha_nacimiento !== '1970-01-01') {
      isMatch = patient.fecha_nacimiento === fecha_nacimiento;
    }

    if (!isMatch) {
      // Increment failed attempts
      const newAttempts = (consultation.intentos_fallidos || 0) + 1;
      let blockedUntilStr = null;

      if (newAttempts >= 3) {
        // Lockout for 15 minutes
        blockedUntilStr = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await supabase
          .from('consultas')
          .update({ intentos_fallidos: 0, auth_blocked_until: blockedUntilStr })
          .eq('id', consultaId);
      } else {
        await supabase
          .from('consultas')
          .update({ intentos_fallidos: newAttempts })
          .eq('id', consultaId);
      }

      // Record authentication failure in audit trail
      await supabase.from('audit_logs').insert({
        consulta_id: consultaId,
        event_type: 'AUTH_GATE_FAIL',
        details: { 
          reason: 'invalid_credentials', 
          attempts: newAttempts,
          blocked: newAttempts >= 3,
          ip: clientIp 
        },
        ip: clientIp,
        user_agent: userAgent,
      });

      if (newAttempts >= 3) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: { 
              code: 'AUTH_BLOCKED', 
              message: 'Demasiados intentos fallidos. Enlace bloqueado por 15 minutos.',
              blocked_until: blockedUntilStr 
            } 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: { 
              code: 'INVALID_CREDENTIALS', 
              message: 'Los datos ingresados no coinciden.', 
              attempts_remaining: 3 - newAttempts 
            } 
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 9. Reset failed attempts on success
    await supabase
      .from('consultas')
      .update({ intentos_fallidos: 0, auth_blocked_until: null })
      .eq('id', consultaId);

    // Persist real birthdate in database if it was the placeholder '1970-01-01'
    if (patient.fecha_nacimiento === '1970-01-01' && fecha_nacimiento) {
      await supabase
        .from('pacientes')
        .update({ fecha_nacimiento })
        .eq('id', patient.id);
      patient.fecha_nacimiento = fecha_nacimiento;
    }

    // 10. Mark JTI as used in a race-condition safe insertion
    const expiresAt = new Date(exp * 1000).toISOString();
    const { data: insertedJti, error: jtiInsertError } = await supabase
      .from('jwt_jti_used')
      .insert({ jti, expires_at: expiresAt })
      .select('jti')
      .maybeSingle();

    if (jtiInsertError || !insertedJti) {
      console.warn('JTI double use race condition intercepted:', jtiInsertError);
      return new Response(
        JSON.stringify({ success: false, error: { code: 'TOKEN_ALREADY_USED' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 11. Issue short-lived session token (1h)
    const sessionToken = await generateSessionToken(consultaId, patient.id, patientSecret);

    // 12. Write SUCCESS audit log
    await supabase.from('audit_logs').insert({
      consulta_id: consultaId,
      event_type: 'AUTH_GATE_SUCCESS',
      details: { paciente_id: patient.id, ip: clientIp },
      ip: clientIp,
      user_agent: userAgent,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          consulta_id: consultaId,
          session_token: sessionToken,
          patient: {
            nombre: patient.nombre,
            telefono: patient.telefono,
            fecha_nacimiento: patient.fecha_nacimiento,
          }
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('Unhandled Auth-Gate exception:', err);
    return new Response(
      JSON.stringify({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
