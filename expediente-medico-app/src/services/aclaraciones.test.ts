import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAclaraciones } from './aclaraciones';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({
  supabase: { from: vi.fn() },
}));

// Builds a chainable query mock whose terminal call resolves to `result`
function queryBuilder(terminal: 'maybeSingle' | 'order', result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder[terminal] = vi.fn().mockResolvedValue(result);
  return builder;
}

describe('fetchAclaraciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the aclaraciones of the signed SOAP note', async () => {
    const rows = [{ id: 'a1', aclaracion_texto: 'Corrección de dosis', creado_at: '2026-10-01T10:00:00Z' }];
    vi.mocked(supabase.from)
      .mockReturnValueOnce(queryBuilder('maybeSingle', { data: { id: 'nota-1' }, error: null }) as never)
      .mockReturnValueOnce(queryBuilder('order', { data: rows, error: null }) as never);

    await expect(fetchAclaraciones('consulta-1')).resolves.toEqual(rows);
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'soap_aclaraciones');
  });

  it('returns an empty list when there is no signed note', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(queryBuilder('maybeSingle', { data: null, error: null }) as never);

    await expect(fetchAclaraciones('consulta-1')).resolves.toEqual([]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('throws instead of returning an empty list when the query fails', async () => {
    const rlsError = { message: 'permission denied for table soap_aclaraciones', code: '42501' };
    vi.mocked(supabase.from)
      .mockReturnValueOnce(queryBuilder('maybeSingle', { data: { id: 'nota-1' }, error: null }) as never)
      .mockReturnValueOnce(queryBuilder('order', { data: null, error: rlsError }) as never);

    await expect(fetchAclaraciones('consulta-1')).rejects.toEqual(rlsError);
  });
});
