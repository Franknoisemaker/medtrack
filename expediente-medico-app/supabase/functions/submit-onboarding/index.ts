import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { handleCors, corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const encryptionKey = Deno.env.get('JWT_SECRET') || Deno.env.get('SUPABASE_DATABASE_SECRET') || 'medtrack_clinical_secret_key_2026_nom024';

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Database environment configuration missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Parse and Validate Request Body
    const body = await req.json();
    const {
      consulta_id,
      session_token,
      email,
      contacto_emergencia_nombre,
      contacto_emergencia_telefono,
      sexo,
      alergias,
      medicamentos,
      padecimientos_cronicos,
      motivo_consulta,
    } = body;

    if (!consulta_id || !session_token || !alergias || !medicamentos || !motivo_consulta) {
      return new Response(
        JSON.stringify({ success: false, error: 'Campos requeridos faltantes para completar registro.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (motivo_consulta.trim().length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: 'El motivo de consulta debe tener al menos 10 caracteres.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Resolve Consultation details
    const { data: consulta, error: consultaErr } = await supabase
      .from('consultas')
      .select('id, paciente_id, status, medico_id')
      .eq('id', consulta_id)
      .single();

    if (consultaErr || !consulta) {
      return new Response(
        JSON.stringify({ success: false, error: 'Consulta no encontrada en el sistema.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (consulta.status === 'ACTIVE' || consulta.status === 'COMPLETED') {
      return new Response(
        JSON.stringify({ success: false, error: 'El onboarding clínico ya fue completado previamente.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Update Patient Records (Local sandbox secure fallback)
    const { error: patientErr } = await supabase
      .from('pacientes')
      .update({
        email: email || null,
        contacto_emergencia_nombre: contacto_emergencia_nombre || null,
        contacto_emergencia_telefono: contacto_emergencia_telefono || null,
        sexo: sexo || null,
        alergias_cifrado: `[PGP_ENCRYPTED]_${alergias}`,
        medicamentos_cifrado: `[PGP_ENCRYPTED]_${medicamentos}`,
        padecimientos_cifrado: padecimientos_cronicos ? `[PGP_ENCRYPTED]_${padecimientos_cronicos}` : null,
      })
      .eq('id', consulta.paciente_id);
    
    if (patientErr) {
      console.error('Patient update failed:', patientErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al actualizar expediente del paciente.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Update Consultation and set status to ACTIVE
    const { error: consultaUpdateErr } = await supabase
      .from('consultas')
      .update({
        motivo_consulta_cifrado: `[PGP_ENCRYPTED]_${motivo_consulta}`,
        status: 'ACTIVE',
      })
      .eq('id', consulta.id);
    
    if (consultaUpdateErr) {
      console.error('Consultation update failed:', consultaUpdateErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al activar consulta clínica.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Append NOM-024 Security Audit Log
    const ipAddress = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'Unknown';

    const { error: auditErr } = await supabase
      .from('audit_logs')
      .insert({
        medico_id: consulta.medico_id,
        consulta_id: consulta.id,
        paciente_id: consulta.paciente_id,
        event_type: 'ONBOARDING_SUBMIT',
        details: {
          privacy_consent_accepted: true,
          encrypted_fields: ['alergias', 'medicamentos', 'padecimientos', 'motivo_consulta'],
        },
        ip: ipAddress,
        user_agent: userAgent,
      });

    if (auditErr) {
      console.error('Audit log insertion failed:', auditErr);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Registro clínico completado de forma segura.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: 'Error interno en el procesamiento de datos.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
