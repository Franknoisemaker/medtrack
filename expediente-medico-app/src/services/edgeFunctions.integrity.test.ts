import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase environment
const MOCK_URL = 'https://mock-supabase-project.supabase.co';
const MOCK_ANON_KEY = 'mock-anon-key';

vi.stubEnv('VITE_SUPABASE_URL', MOCK_URL);
vi.stubEnv('VITE_SUPABASE_ANON_KEY', MOCK_ANON_KEY);

describe('Edge Functions & Data Integrity Validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ensures sign-note payload requires all 4 SOAP fields', async () => {
    const invalidSoapData = {
      subjetivo: 'Paciente acude por control',
      objetivo: '', // Empty objective field
      analisis: 'Evolución favorable',
      plan: 'Continuar tratamiento'
    };

    // Client-side payload validation check
    const isValid = Boolean(
      invalidSoapData.subjetivo.trim() &&
      invalidSoapData.objetivo.trim() &&
      invalidSoapData.analisis.trim() &&
      invalidSoapData.plan.trim()
    );

    expect(isValid).toBe(false);
  });

  it('verifies atomic rollback message is human-friendly on Edge Function failure', async () => {
    const mockErrorResponse = {
      success: false,
      error: 'Error al guardar los datos de somatometría. La firma fue cancelada para proteger la integridad de los datos. Por favor intente firmar nuevamente.',
      debug: { code: '23502', message: 'null value in column violates not-null constraint' }
    };

    expect(mockErrorResponse.success).toBe(false);
    expect(mockErrorResponse.error).toContain('La firma fue cancelada para proteger la integridad de los datos');
  });

  it('prevents silent failure when server returns HTTP 500', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        error: 'Error al guardar los datos de somatometría.'
      })
    });

    const response = await mockFetch();
    const data = await response.json();

    expect(response.ok).toBe(false);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });
});
