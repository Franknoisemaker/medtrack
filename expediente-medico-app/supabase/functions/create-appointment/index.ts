// Supabase Edge Function: create-appointment
// Complies with NOM-004 and NOM-024 for secure onboarding session token generation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0';
import { SignJWT } from 'https://esm.sh/jose@5.2.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

// Helper function to sign the single-use patient token using Web Crypto standard (runs in both Node and Deno)
export async function generatePatientToken(consultaId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);
  
  return await new SignJWT({
    sub: consultaId,
    jti: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secretKey);
}

Deno.serve(async (req) => {
  // 1. Handle CORS preflight OPTIONS request
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // 2. Authenticate the Doctor using their Supabase JWT
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Missing or malformed Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const doctorToken = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    // We use the service_role key to act as a system administrative worker
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the caller's JWT token
    let doctorId: string | null = null;
    let user: any = null;
    const isLocalDev = !supabaseUrl.startsWith('https://') || 
                       supabaseUrl.includes('localhost') || 
                       supabaseUrl.includes('127.0.0.1') || 
                       supabaseUrl.includes('kong');

    if (doctorToken === 'mock-doctor-session-token' && isLocalDev) {
      // Local dev sandbox bypass: fallback to seeded doctor
      doctorId = 'a6b12a8a-e55d-4f11-8ac1-f11181283c44';
    } else {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(doctorToken);
      if (authError || !authUser) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized: Invalid doctor JWT session token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      user = authUser;
      doctorId = authUser.id;
    }

    // 3. Parse and validate the request body
    const body = await req.json().catch(() => ({}));
    const { nombre, telefono, email, fecha_hora, paciente_id, omitir_onboarding } = body;

    if (!nombre || !telefono || !fecha_hora) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters: nombre, telefono, and fecha_hora are mandatory' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Self-Healing check: Ensure the doctor exists in the "medicos" table
    const { data: doctorExists } = await supabase
      .from('medicos')
      .select('id')
      .eq('id', doctorId)
      .maybeSingle();

    if (!doctorExists) {
      const doctorName = user?.user_metadata?.nombre || user?.email || 'Dr. MedTrack Local';
      const doctorEmail = user?.email || `${doctorId}@medtrack.mx`;

      const { error: insertDoctorError } = await supabase
        .from('medicos')
        .insert({
          id: doctorId,
          nombre: doctorName,
          cedula_cifrada: `[PGP_ENCRYPTED]_CED-${doctorId.slice(0, 8).toUpperCase()}`,
          email: doctorEmail,
        });
      
      if (insertDoctorError) {
        console.error('Failed to create self-healing doctor record:', insertDoctorError);
        return new Response(
          JSON.stringify({ success: false, error: 'Internal Server Error: Failed to register doctor identity' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 5. Retrieve or Create the Patient Record
    let pacienteId: string | undefined = undefined;

    if (paciente_id) {
      const { data: existingPatient } = await supabase
        .from('pacientes')
        .select('id')
        .eq('id', paciente_id)
        .maybeSingle();

      if (existingPatient) {
        pacienteId = existingPatient.id;
      }
    }

    if (!pacienteId) {
      // Safe check: Check if patient already exists with BOTH the same name and phone number
      // This ensures distinct patients sharing a telephone number (e.g., family members) are NOT merged,
      // and homonyms with different telephone numbers are also NOT merged.
      const { data: existingMatch } = await supabase
        .from('pacientes')
        .select('id')
        .eq('telefono', telefono)
        .ilike('nombre', nombre.trim())
        .maybeSingle();

      if (existingMatch) {
        pacienteId = existingMatch.id;
      } else {
        // Create a new patient record (default behavior)
        // We insert a placeholder birthdate ('1970-01-01') which the patient will fill out during onboarding
        const { data: newPatient, error: patientError } = await supabase
          .from('pacientes')
          .insert({
            nombre: nombre,
            telefono: telefono,
            email: email || null,
            fecha_nacimiento: '1970-01-01',
          })
          .select('id')
          .single();

        if (patientError || !newPatient) {
          console.error('Failed to create patient record:', patientError);
          return new Response(
            JSON.stringify({ success: false, error: 'Internal Server Error: Failed to create patient record' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        pacienteId = newPatient.id;
      }
    }

    // 6. Create the Consultation record (determine status based on onboarding omission)
    const consultaStatus = (pacienteId && omitir_onboarding) ? 'ACTIVE' : 'PENDING_ONBOARDING';

    const { data: newConsultation, error: consultationError } = await supabase
      .from('consultas')
      .insert({
        medico_id: doctorId,
        paciente_id: pacienteId,
        fecha_hora: fecha_hora,
        status: consultaStatus,
      })
      .select('id')
      .single();

    if (consultationError || !newConsultation) {
      console.error('Failed to create consultation:', consultationError);
      return new Response(
        JSON.stringify({ success: false, error: 'Internal Server Error: Failed to schedule consultation record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const consultaId = newConsultation.id;

    // 7. Generate a Single-Use Patient JWT (only if onboarding is not bypassed)
    let patientToken = '';
    if (consultaStatus !== 'ACTIVE') {
      let patientSecret = Deno.env.get('JWT_PATIENT_SECRET');
      if (!patientSecret) {
        if (isLocalDev) {
          patientSecret = 'fallback-secret-key-at-least-32-chars-long';
        } else {
          return new Response(
            JSON.stringify({ success: false, error: 'Internal Server Error: Secure patient signing key configuration is missing on server.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      patientToken = await generatePatientToken(consultaId, patientSecret);
    }

    // 8. Register in the NOM-024 Audit Log
    const clientIp = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || '';

    const { error: auditError } = await supabase
      .from('audit_logs')
      .insert({
        consulta_id: consultaId,
        medico_id: doctorId,
        event_type: 'APPOINTMENT_CREATED',
        details: {
          paciente_id: pacienteId,
          nombre_paciente: nombre,
          telefono_paciente: telefono,
          creador: 'doctor_edge_function',
        },
        ip: clientIp,
        user_agent: userAgent,
      });

    if (auditError) {
      console.error('Failed to write audit logs:', auditError);
      // We don't block the request if the audit log insertion failed, but log it to warnings
    }

    // 9. Respond with the safe magic onboarding link or direct active confirmation
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          token: patientToken || null,
          url: patientToken ? `https://medtrack.mx/onboarding?token=${patientToken}` : null,
          status: consultaStatus,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('Unhandled request exception:', err);
    return new Response(
      JSON.stringify({ success: false, error: `Internal Server Error: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
