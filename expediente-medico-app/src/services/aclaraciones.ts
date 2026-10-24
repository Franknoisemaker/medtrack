import { supabase } from './supabase';

export interface Aclaracion {
  id: string;
  aclaracion_texto: string;
  creado_at: string;
}

/**
 * Returns the id of the signed nota_soap for a consultation, or null if none exists.
 * Throws on query errors (e.g. RLS denial) so callers can surface them instead of
 * silently showing an empty list.
 */
export async function getSignedNotaSoapId(consultaId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('notas_soap')
    .select('id')
    .eq('consulta_id', consultaId)
    .eq('status', 'signed')
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

/** Fetches the aclaraciones attached to a consultation's signed SOAP note, oldest first. */
export async function fetchAclaraciones(consultaId: string): Promise<Aclaracion[]> {
  const notaSoapId = await getSignedNotaSoapId(consultaId);
  if (!notaSoapId) return [];

  const { data, error } = await supabase
    .from('soap_aclaraciones')
    .select('id, aclaracion_texto, creado_at')
    .eq('nota_soap_id', notaSoapId)
    .order('creado_at', { ascending: true });

  if (error) throw error;
  return data || [];
}
