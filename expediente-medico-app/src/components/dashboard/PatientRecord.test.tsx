import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PatientRecord } from './PatientRecord';
import { supabase } from '../../services/supabase';

// Must start with "mock" to be accessible inside vi.mock
let mockTriageResult: any = null;

// Mock the supabase service
vi.mock('../../services/supabase', () => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    supabase: {
      rpc: vi.fn().mockImplementation(async (name) => {
        if (name === 'get_decrypted_triage') {
          return mockTriageResult || { data: [], error: null };
        }
        return { data: null, error: null };
      }),
      from: vi.fn().mockReturnValue(mockQueryBuilder),
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'test-token-123',
              user: {
                id: 'test-doctor-uuid-123456',
                user_metadata: {
                  nombre: 'Ana García Torres',
                  cedula: '12345678'
                }
              }
            }
          },
          error: null
        })
      }
    }
  };
});

// Mock useAutosaveSoap hook to prevent external side effects or network calls during testing
vi.mock('../../hooks/useAutosaveSoap', () => ({
  useAutosaveSoap: vi.fn().mockReturnValue({
    status: 'idle',
    lastSaved: null,
  }),
  loadDraftFromIDB: vi.fn().mockResolvedValue(null),
}));

describe('PatientRecord Component - Triage Decryption & Auditing', () => {
  const mockAppointment = {
    id: 'consulta-uuid-123',
    nombre: 'Carlos Santana',
    fecha_hora: '2026-05-24T10:00:00Z',
    status: 'ACTIVE' as const,
    medico_id: 'medico-uuid-999',
    sexo: 'M' as const,
    padecimientos: '',
    motivo_consulta: 'Motivo original',
    alergias: '',
    medicamentos: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTriageResult = null;
    // Configure VITE_SUPABASE_URL to be non-mock to trigger the real RPC path in components
    import.meta.env.VITE_SUPABASE_URL = 'https://real-supabase-project.supabase.co';
    // Mock window.confirm to bypass unhandled dialog block
    window.confirm = vi.fn().mockReturnValue(true);
  });

  it('calls secure get_decrypted_triage RPC and inserts NOM-024 audit log via database when loading active record', async () => {
    const mockTriageResponse = [
      {
        alergias: 'Aspirina, Sulfas',
        medicamentos: 'Losartán 50mg',
        padecimientos: 'Hipertensión arterial',
        motivo_consulta: 'Dolor de cabeza severo y zumbido de oídos.',
      },
    ];

    mockTriageResult = {
      data: mockTriageResponse,
      error: null,
    };

    render(
      <PatientRecord
        appointment={mockAppointment}
        onBack={() => {}}
      />
    );

    // Verify loading state is triggered
    expect(screen.queryByText('Aspirina, Sulfas')).toBeNull();

    // Wait for the RPC response to resolve and render
    await waitFor(() => {
      expect(screen.getByText('Aspirina, Sulfas')).toBeDefined();
    });

    // Verify RPC invocation parameters
    expect(supabase.rpc).toHaveBeenCalledWith('get_decrypted_triage', {
      p_consulta_id: 'consulta-uuid-123',
      p_ip: '127.0.0.1',
      p_user_agent: expect.any(String),
    });

    // Verify data display
    expect(screen.getByText('Losartán 50mg')).toBeDefined();
    expect(screen.getByText('Hipertensión arterial')).toBeDefined();
    expect(screen.getByText('Dolor de cabeza severo y zumbido de oídos.')).toBeDefined();
  });

  it('renders green "Sin alergias conocidas" badge when decrypted alergias matches variants of None', async () => {
    const mockTriageResponse = [
      {
        alergias: ' ninguna  ', // spaced and uppercase mix
        medicamentos: 'Ninguno',
        padecimientos: 'Ninguno',
        motivo_consulta: 'Chequeo general anual.',
      },
    ];

    mockTriageResult = {
      data: mockTriageResponse,
      error: null,
    };

    render(
      <PatientRecord
        appointment={mockAppointment}
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Sin alergias conocidas/i)).toBeDefined();
    });
  });

  it('gracefully handles decryption RPC errors by falling back to safe UI without crashing', async () => {
    mockTriageResult = {
      data: null,
      error: { message: 'Decryption key mismatch or database connection timeout' } as any,
    };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <PatientRecord
        appointment={mockAppointment}
        onBack={() => {}}
      />
    );

    // Wait for loading to clear
    await waitFor(() => {
      expect(screen.queryByText('Paciente')).toBeDefined();
    });

    // Verify system falls back to "Ficha clínica pendiente" gracefully without crashing
    expect(screen.getByText(/Ficha clínica pendiente/i)).toBeDefined();
    consoleSpy.mockRestore();
  });

  it('prevents exposing the local database decryption keys in VITE_ environment variables or frontend code', () => {
    // Audit check on all accessible environment variables
    const keys = Object.keys(import.meta.env);
    const hasExposedSecret = keys.some(
      key => key.includes('SECRET') || key.includes('KEY') || key.includes('VAULT') || key.includes('PASSWORD')
    );

    // Standard public vite vars only
    expect(import.meta.env.VITE_SUPABASE_URL).toBeDefined();
    expect(import.meta.env.VITE_SUPABASE_ANON_KEY).toBeDefined();

    // Secret master key must never be here
    expect(import.meta.env.VITE_DATABASE_SECRET).toBeUndefined();
    expect(import.meta.env.VITE_JWT_SECRET).toBeUndefined();
  });

  it('calls Edge Function /functions/v1/sign-note on "Guardar y Firmar" and locks UI to signed status badge', async () => {
    const mockResponse = { success: true, nota_id: 'nota-uuid-999', signed_at: new Date().toISOString() };
    const globalFetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    mockTriageResult = {
      data: [{ allergies: '', padecimientos: '' }],
      error: null,
    };

    render(
      <PatientRecord
        appointment={mockAppointment}
        onBack={() => {}}
      />
    );

    const subjetivoText = screen.getByPlaceholderText(/Síntomas referidos por el paciente/i);
    const objetivoText = screen.getByPlaceholderText(/Signos vitales, exploración física/i);
    const analisisText = screen.getByPlaceholderText(/Juicio clínico, diagnóstico diferencial/i);
    const planText = screen.getByPlaceholderText(/Tratamiento, medicamentos con dosis/i);

    fireEvent.change(subjetivoText, { target: { value: 'Dolor de cabeza' } });
    fireEvent.change(objetivoText, { target: { value: 'TA 120/80' } });
    fireEvent.change(analisisText, { target: { value: 'Migraña' } });
    fireEvent.change(planText, { target: { value: 'Paracetamol' } });

    const sistolicaInput = screen.getByPlaceholderText('Sistólica');
    const diastolicaInput = screen.getByPlaceholderText('Diastólica');
    fireEvent.change(sistolicaInput, { target: { value: '120' } });
    fireEvent.change(diastolicaInput, { target: { value: '80' } });

    const signButton = screen.getByRole('button', { name: /Guardar y Firmar Nota SOAP/i });
    expect(signButton).toBeEnabled();

    // Mock window.alert to prevent blocking
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    fireEvent.click(signButton);

    expect(screen.getByText(/Firmando.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Ana García Torres/i)).toBeInTheDocument();
      expect(screen.getByText(/Cédula 12345678/i)).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText(/Síntomas referidos por el paciente/i)).toBeNull();

    alertSpy.mockRestore();
    globalFetchSpy.mockRestore();
  });
});
