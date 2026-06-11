import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewAppointmentForm } from './NewAppointmentForm';

describe('NewAppointmentForm Component', () => {
  const mockOnAppointmentCreated = vi.fn();
  let originalSupabaseUrl: string | undefined;

  beforeEach(() => {
    mockOnAppointmentCreated.mockClear();
    originalSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    import.meta.env.VITE_SUPABASE_URL = 'https://your-project-id.supabase.co';
  });

  afterEach(() => {
    import.meta.env.VITE_SUPABASE_URL = originalSupabaseUrl;
  });

  it('renders form elements correctly', () => {
    const { container } = render(<NewAppointmentForm onAppointmentCreated={mockOnAppointmentCreated} />);

    expect(screen.getByText(/Agendar Nueva Cita/i)).toBeInTheDocument();
    expect(screen.getByText(/Nombre del Paciente \*/i)).toBeInTheDocument();
    expect(screen.getByText(/Teléfono Celular \*/i)).toBeInTheDocument();
    expect(screen.getByText(/Correo Electrónico \(Opcional\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Fecha y Hora de la Cita \*/i)).toBeInTheDocument();
    expect(screen.getByText(/Guardar Cita 💾/i)).toBeInTheDocument();

    // Verify inputs exist
    expect(screen.getByPlaceholderText('ej. Elena Ruiz Mendoza')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ej. 5512345678 (10 dígitos)')).toBeInTheDocument();
    expect(container.querySelector('input[type="datetime-local"]')).toBeInTheDocument();
  });

  it('validates fields and shows error messages if fields are empty', async () => {
    render(<NewAppointmentForm onAppointmentCreated={mockOnAppointmentCreated} />);

    const submitBtn = screen.getByText(/Guardar Cita 💾/i);
    fireEvent.click(submitBtn);

    expect(screen.getByText('El nombre del paciente es requerido.')).toBeInTheDocument();
    expect(screen.getByText('El teléfono es requerido.')).toBeInTheDocument();
    expect(screen.getByText('La fecha y hora de la cita son requeridas.')).toBeInTheDocument();
  });

  it('creates an appointment successfully and allows copying the full WhatsApp message', async () => {
    // Mock navigator.clipboard
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });

    const { container } = render(<NewAppointmentForm onAppointmentCreated={mockOnAppointmentCreated} />);

    // Fill the inputs
    const nombreInput = screen.getByPlaceholderText('ej. Elena Ruiz Mendoza');
    const telefonoInput = screen.getByPlaceholderText('ej. 5512345678 (10 dígitos)');
    const fechaHoraInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;

    // Future date: 1 day in the future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const futureDateStr = futureDate.toISOString().slice(0, 16);

    fireEvent.change(nombreInput, { target: { value: 'Juan Perez' } });
    fireEvent.change(telefonoInput, { target: { value: '5551234567' } });
    fireEvent.change(fechaHoraInput, { target: { value: futureDateStr } });

    // Submit form
    const submitBtn = screen.getByText(/Guardar Cita 💾/i);
    fireEvent.click(submitBtn);

    // Wait for the asynchronous mock response and success screen
    await waitFor(() => {
      expect(screen.getByText(/¡Cita Agendada Exitosamente!/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    expect(mockOnAppointmentCreated).toHaveBeenCalled();

    // Verify copy button copies the full message, not just the URL
    const copyBtn = screen.getByText(/Copiar mensaje 🔗/i);
    fireEvent.click(copyBtn);

    expect(mockWriteText).toHaveBeenCalled();
    const copiedText = mockWriteText.mock.calls[0][0];

    // Assert that the copied text contains the full formatted message with NOM-004-SSA3 reference
    expect(copiedText).toContain('Expediente Clínico Digital — MedTrack');
    expect(copiedText).toContain('Juan Perez');
    expect(copiedText).toContain('NOM-004-SSA3');
    expect(copiedText).toContain('/?s=');

    // Verify button feedback state
    expect(screen.getByText(/¡Mensaje Copiado! 📋/i)).toBeInTheDocument();
  });
});
