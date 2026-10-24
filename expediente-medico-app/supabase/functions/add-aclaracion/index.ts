import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { requireDoctor, assertConsultaOwner, HttpError, errorResponse } from '../_shared/doctorAuth.ts';
import { sha256hex, hmacSha256, getClinicalSigningKey } from '../_shared/clinicalSignature.ts';

// Appends a nota aclaratoria to a signed SOAP note (NOM-004 / PRD FR-3.9).
// The HMAC signature is computed here so the signing key is never shipped to the browser.
// soap_aclaraciones has no client INSERT policy: this function is the only write path.

const ACLARACION_PREFIX = 'medtrack-aclaracion-v1';
const MIN_LENGTH = 10;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const isLocalDev = !supabaseUrl.startsWith('https://') ||
                       supabaseUrl.includes('localhost') ||
                       supabaseUrl.includes('127.0.0.1') ||
                       supabaseUrl.includes('kong');

    const signingKey = getClinicalSigningKey(isLocalDev);
    if (!signingKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Internal Server Error: Secure clinical signing key configuration is missing on server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');

    const body = await req.json().catch(() => ({}));
    const consultaId: string | undefined = body.consulta_id;
    const texto = typeof body.aclaracion_texto === 'string' ? body.aclaracion_texto.trim() : '';

    if (!consultaId || texto.length < MIN_LENGTH) {
      return new Response(
        JSON.stringify({ success: false, error: `Se requiere consulta_id y una aclaración de al menos ${MIN_LENGTH} caracteres.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const medicoId = await requireDoctor(req, supabase, isLocalDev);
    await assertConsultaOwner(supabase, consultaId, medicoId);

    const { data: nota } = await supabase
      .from('notas_soap')
      .select('id')
      .eq('consulta_id', consultaId)
      .eq('status', 'signed')
      .maybeSingle();

    if (!nota) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró una nota SOAP firmada para esta consulta.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // The stored creado_at is the signed timestamp, so the signature can be re-verified later
    const timestamp = new Date().toISOString();
    const sigMessage = `${ACLARACION_PREFIX}:${nota.id}:${medicoId}:${timestamp}:${await sha256hex(texto)}`;
    const firma = await hmacSha256(signingKey, sigMessage);

    const { data: aclaracion, error: insertErr } = await supabase
      .from('soap_aclaraciones')
      .insert({
        nota_soap_id: nota.id,
        medico_id: medicoId,
        aclaracion_texto: texto,
        firma_electronica: firma,
        creado_at: timestamp,
      })
      .select('id, aclaracion_texto, creado_at')
      .single();

    if (insertErr || !aclaracion) {
      console.error(`[add-aclaracion:${consultaId}] insert error:`, JSON.stringify(insertErr));
      return new Response(
        JSON.stringify({ success: false, error: 'Error al guardar la nota aclaratoria.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '127.0.0.1';
    const { error: auditErr } = await supabase.from('audit_logs').insert({
      medico_id: medicoId,
      consulta_id: consultaId,
      event_type: 'SOAP_NOTE_ACLARATORIA',
      details: { nota_id: nota.id, aclaracion_id: aclaracion.id, firma_prefix: firma.substring(0, 8) + '...' },
      ip,
      user_agent: req.headers.get('user-agent') ?? 'Unknown',
    });
    if (auditErr) {
      console.warn(`[add-aclaracion:${consultaId}] Audit log insertion warning:`, JSON.stringify(auditErr));
    }

    return new Response(
      JSON.stringify({ success: true, aclaracion }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err);
    console.error('add-aclaracion error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Error interno al guardar la nota aclaratoria.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
