// Shared doctor authentication + ownership checks for Edge Functions.
// Edge Functions use the service role key, which bypasses RLS, so every function that
// touches clinical data must verify the caller and the consultation ownership itself.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from './cors.ts';

// Seeded doctor used by the local development sandbox only
export const LOCAL_DEV_DOCTOR_ID = 'a6b12a8a-e55d-4f11-8ac1-f11181283c44';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorResponse(err: HttpError): Response {
  return new Response(
    JSON.stringify({ success: false, error: err.message }),
    { status: err.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Resolves the calling doctor's id from the Authorization header.
 * Never trust a medico_id sent in the request body.
 * In the local sandbox a missing/mock token falls back to the seeded doctor.
 */
export async function requireDoctor(
  req: Request,
  supabase: SupabaseClient,
  isLocalDev: boolean
): Promise<string> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';

  if (token && token !== 'mock-doctor-session-token') {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (user && !error) {
      if (user.app_metadata?.role !== 'clinic_doctor' && !isLocalDev) {
        throw new HttpError(403, 'Acceso denegado. Solo médicos pueden realizar esta acción.');
      }
      return user.id;
    }
  }

  if (isLocalDev) return LOCAL_DEV_DOCTOR_ID;
  throw new HttpError(401, 'Acceso denegado. Se requiere un token de sesión de médico válido.');
}

/** Throws 403 unless the consultation exists and is assigned to the given doctor. */
export async function assertConsultaOwner(
  supabase: SupabaseClient,
  consultaId: string,
  medicoId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('consultas')
    .select('id')
    .eq('id', consultaId)
    .eq('medico_id', medicoId)
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(403, 'Acceso denegado. No eres el médico asignado a esta consulta.');
  }
}
