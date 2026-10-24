import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SoapEditor } from './SoapEditor';
import { supabase } from '../../services/supabase';
import { fetchAclaraciones } from '../../services/aclaraciones';

// Mock the supabase client completely
vi.mock('../../services/supabase', () => {
  const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: mockInsert,
  };
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: 'test-medico-id-456' }
            }
          },
          error: null
        }),
      },
      from: vi.fn().mockReturnValue(mockQueryBuilder),
      rpc: vi.fn().mockResolvedValue({ data: 'draft-uuid-789', error: null }),
    }
  };
});

vi.mock('../../services/aclaraciones', () => ({
  fetchAclaraciones: vi.fn().mockResolvedValue([]),
  getSignedNotaSoapId: vi.fn().mockResolvedValue(null),
}));

describe('SoapEditor Component', () => {
  const mockConsultaId = 'consulta-uuid-111';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all four SOAP fields (Subjetivo, Objetivo, Análisis, Plan)', () => {
    render(<SoapEditor consultaId={mockConsultaId} />);
    
    expect(screen.getByPlaceholderText(/Síntomas referidos por el paciente/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Signos vitales, exploración física/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Juicio clínico, diagnóstico diferencial/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tratamiento, medicamentos con dosis/i)).toBeInTheDocument();
  });

  it('inserts text on quick chip click and fires SOAP_CHIP_INSERTED audit log in Supabase', async () => {
    render(<SoapEditor consultaId={mockConsultaId} />);
    
    // Find a quick chip in the Subjetivo field (e.g., 'Con fiebre')
    const chipButton = screen.getByText('Con fiebre');
    expect(chipButton).toBeInTheDocument();
    
    // Click the chip button
    fireEvent.click(chipButton);
    
    // Check that text is inserted into the Subjetivo textarea
    const subjetivoTextarea = screen.getByPlaceholderText(/Síntomas referidos por el paciente/i) as HTMLTextAreaElement;
    expect(subjetivoTextarea.value).toContain('Con fiebre. ');

    // Verify that Supabase insert was called for audit trail logging
    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('audit_logs');
    });
  });

  it('opens SoapFocusOverlay for iPad mode on clicking "Modo Enfoque"', async () => {
    // Force window innerWidth to simulate iPad
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    
    render(<SoapEditor consultaId={mockConsultaId} />);
    
    const focusButtons = screen.getAllByText(/Modo Enfoque/i);
    expect(focusButtons.length).toBeGreaterThan(0);
    
    // Click focus button on Subjetivo field
    fireEvent.click(focusButtons[0]);
    
    // Verify focus modal title and overlay layout exists
    expect(screen.getByText('Modo Enfoque iPad')).toBeInTheDocument();
    expect(screen.getByText('S — Subjetivo')).toBeInTheDocument();
    
    // Close the focus modal
    const closeButton = screen.getByText(/Cerrar/i);
    fireEvent.click(closeButton);
    
    expect(screen.queryByText('Modo Enfoque iPad')).not.toBeInTheDocument();
  });

  it('applies font-size 16px to prevent Safari auto-zoom on iOS devices', () => {
    render(<SoapEditor consultaId={mockConsultaId} />);
    
    const textareas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    textareas.forEach(textarea => {
      expect(textarea.style.fontSize).toBe('16px');
    });
  });

  it('shows saved aclaraciones on a signed (read-only) note', async () => {
    vi.mocked(fetchAclaraciones).mockResolvedValueOnce([
      { id: 'a1', aclaracion_texto: 'Se corrige la dosis de metformina a 850 mg.', creado_at: '2026-10-01T10:00:00Z' },
    ]);

    render(<SoapEditor consultaId={mockConsultaId} readOnly />);

    expect(await screen.findByText('Se corrige la dosis de metformina a 850 mg.')).toBeInTheDocument();
    expect(fetchAclaraciones).toHaveBeenCalledWith(mockConsultaId);
  });

  it('shows an error instead of an empty list when aclaraciones fail to load', async () => {
    vi.mocked(fetchAclaraciones).mockRejectedValueOnce({ message: 'permission denied', code: '42501' });

    render(<SoapEditor consultaId={mockConsultaId} readOnly />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudieron cargar las notas aclaratorias/i);
  });

  it('saves an aclaracion through the add-aclaracion Edge Function, never inserting directly', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://real-project.supabase.co');
    const saved = { id: 'srv-1', aclaracion_texto: 'Se corrige la dosis a 850 mg.', creado_at: '2026-10-24T10:00:00Z' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, aclaracion: saved }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<SoapEditor consultaId={mockConsultaId} readOnly />);
    fireEvent.click(await screen.findByText(/Agregar Nota Aclaratoria/i));
    fireEvent.change(screen.getByPlaceholderText(/Aclaración o corrección/i), { target: { value: saved.aclaracion_texto } });
    fireEvent.click(screen.getByText('Guardar Aclaración'));

    expect(await screen.findByText(saved.aclaracion_texto)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/functions/v1/add-aclaracion');
    expect(JSON.parse(init.body)).toEqual({ consulta_id: mockConsultaId, aclaracion_texto: saved.aclaracion_texto });
    expect(supabase.from).not.toHaveBeenCalledWith('soap_aclaraciones');

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('when the server returns undecrypted (armored) content', () => {
    const ARMORED = '-----BEGIN PGP MESSAGE-----\n\nww0EBwMC...\n-----END PGP MESSAGE-----';
    const encryptedNote = (status: string) => ({
      data: [{ subjetivo: ARMORED, objetivo: ARMORED, analisis: ARMORED, plan: ARMORED, nota_status: status, creado_at: '2026-10-24T10:00:00Z', medico_id: null }],
      error: null,
    });

    it('never displays ciphertext on a signed note', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce(encryptedNote('signed') as never);

      render(<SoapEditor consultaId={mockConsultaId} readOnly />);

      expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo descifrar esta nota/i);
      expect(screen.queryByText(/BEGIN PGP MESSAGE/)).not.toBeInTheDocument();
    });

    it('does not load ciphertext into a draft nor autosave over it', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce(encryptedNote('draft') as never);

      render(<SoapEditor consultaId={mockConsultaId} />);

      expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo descifrar esta nota/i);
      expect(screen.queryByDisplayValue(/BEGIN PGP MESSAGE/)).not.toBeInTheDocument();
      // Run past the autosave debounce (5s) and periodic sync; a write here would double-encrypt
      vi.useFakeTimers();
      await vi.advanceTimersByTimeAsync(35_000);
      vi.useRealTimers();
      expect(supabase.rpc).not.toHaveBeenCalledWith('save_soap_draft', expect.anything());
    });
  });
});
