import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { handleCors, corsHeaders } from '../_shared/cors.ts';

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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const jwtSecret = Deno.env.get('JWT_SECRET') || 'medtrack_clinical_secret_key_2026_nom024';

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { consulta_id, soap_json, somatometria_json, medico_id, cedula } = body;

    if (!consulta_id || !soap_json) {
      return new Response(
        JSON.stringify({ success: false, error: 'Datos requeridos faltantes.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate all 4 SOAP fields are present
    const { subjetivo, objetivo, analisis, plan } = soap_json;
    if (!subjetivo?.trim() || !objetivo?.trim() || !analisis?.trim() || !plan?.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Todos los campos SOAP son obligatorios para firmar.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Compute cryptographic signature
    const timestamp = new Date().toISOString();
    const key_version = 'v1';
    const soapString = JSON.stringify(soap_json);
    const soapHash = await sha256hex(soapString);
    const cedulaHash = cedula ? await sha256hex(cedula) : 'no-cedula';

    const sigMessage = `${SOAP_PREFIX}:${key_version}:${timestamp}:${soapHash}:${cedulaHash}`;
    const firma = await hmacSha256(jwtSecret, sigMessage);

    // Idempotency check: if the note is already signed, return success immediately.
    // This handles retries where the first attempt signed the note but returned 500
    // due to a race condition with the autosave timer.
    const { data: existingNota } = await supabase
      .from('notas_soap')
      .select('id, status')
      .eq('consulta_id', consulta_id)
      .maybeSingle();

    if (existingNota?.status === 'signed') {
      console.log('sign-note: nota already signed, returning idempotent success');
      return new Response(
        JSON.stringify({ success: true, nota_id: existingNota.id, already_signed: true, signed_at: timestamp }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Persist SOAP note with signature
    // Column names must match schema: *_cifrado suffix, no medico_id or somatometria
    // Uses UPSERT because the autosave hook may have already created a draft row for this consulta_id.
    // The unique constraint on consulta_id (migration 20260525000010) ensures only one row per consultation.
    const { data: nota, error: notaErr } = await supabase
      .from('notas_soap')
      .upsert(
        {
          consulta_id,
          subjetivo_cifrado: subjetivo,
          objetivo_cifrado: objetivo,
          analisis_cifrado: analisis,
          plan_cifrado: plan,
          firma_electronica: firma,
          key_version,
          signed_at: timestamp,
          status: 'signed',
        },
        { onConflict: 'consulta_id' }
      )
      .select('id')
      .single();

    if (notaErr) {
      console.error('Error upserting nota_soap:', JSON.stringify(notaErr));
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Error al guardar la nota clínica.',
          // Expose full Postgres error in dev for diagnosis
          debug: { code: notaErr.code, message: notaErr.message, details: notaErr.details, hint: notaErr.hint }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update consultation status to COMPLETED
    await supabase
      .from('consultas')
      .update({ status: 'COMPLETED' })
      .eq('id', consulta_id);

    // NOM-024 audit log
    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '127.0.0.1';
    await supabase.from('audit_logs').insert({
      medico_id,
      consulta_id,
      event_type: 'SOAP_NOTE_CREATE',
      details: {
        nota_id: nota.id,
        key_version,
        firma_prefix: firma.substring(0, 8) + '...',
      },
      ip: ip,
      user_agent: req.headers.get('user-agent') ?? 'Unknown',
    });

    return new Response(
      JSON.stringify({ success: true, nota_id: nota.id, firma_preview: firma.substring(0, 16) + '...', signed_at: timestamp }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('sign-note error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Error interno al firmar la nota.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
