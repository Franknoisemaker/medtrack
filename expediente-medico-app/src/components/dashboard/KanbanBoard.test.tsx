import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KanbanBoard } from './KanbanBoard';
import type { Appointment } from './NewAppointmentForm';

describe('KanbanBoard Component', () => {
  const mockAppointments: Appointment[] = [
    {
      id: '1',
      nombre: 'Juan Perez',
      telefono: '5551234567',
      fecha_hora: '2026-05-24T10:00:00Z',
      status: 'PENDING_ONBOARDING',
    },
    {
      id: '2',
      nombre: 'Maria Lopez',
      telefono: '5557654321',
      fecha_hora: '2026-05-24T11:00:00Z',
      status: 'ACTIVE',
    },
    {
      id: '3',
      nombre: 'Dr. Carlos Ruiz',
      telefono: '5559998888',
      fecha_hora: '2026-05-24T12:00:00Z',
      status: 'COMPLETED',
    },
  ];

  const mockOnSelectPatient = vi.fn();

  it('renders columns correctly with titles', () => {
    render(
      <KanbanBoard
        appointments={mockAppointments}
        onSelectPatient={mockOnSelectPatient}
      />
    );

    expect(screen.getByText('Pendiente de Registro')).toBeDefined();
    expect(screen.getByText('Activas — Listas para SOAP')).toBeDefined();
    expect(screen.getByText('Completadas')).toBeDefined();
  });

  it('displays skeleton cards when isLoading is true', () => {
    const { container } = render(
      <KanbanBoard
        appointments={mockAppointments}
        onSelectPatient={mockOnSelectPatient}
        isLoading={true}
      />
    );

    // SkeletonCard is rendered 3 times per column (3 columns * 3 = 9 skeletons)
    const skeletons = container.querySelectorAll('[style*="pulse"]');
    expect(skeletons.length).toBe(9);
  });

  it('displays "Sin pacientes" placeholder if a column is empty', () => {
    render(
      <KanbanBoard
        appointments={[]}
        onSelectPatient={mockOnSelectPatient}
      />
    );

    const emptyPlaceholders = screen.getAllByText('Sin pacientes');
    expect(emptyPlaceholders.length).toBe(3);
  });

  it('renders appointments under their correct status column', () => {
    render(
      <KanbanBoard
        appointments={mockAppointments}
        onSelectPatient={mockOnSelectPatient}
      />
    );

    expect(screen.getByText('Juan Perez')).toBeDefined();
    expect(screen.getByText('Maria Lopez')).toBeDefined();
    expect(screen.getByText('Dr. Carlos Ruiz')).toBeDefined();

    // Check badges
    expect(screen.getByText('⏳ Pendiente')).toBeDefined();
    expect(screen.getByText('🩺 Expediente Listo')).toBeDefined();
    expect(screen.getByText('✓ Firmada')).toBeDefined();
  });

  it('sorts appointments within a column by appointment time (fecha_hora)', () => {
    const unsortedAppointments: Appointment[] = [
      {
        id: '1',
        nombre: 'Tarde',
        telefono: '111',
        fecha_hora: '2026-05-24T18:00:00Z',
        status: 'ACTIVE',
      },
      {
        id: '2',
        nombre: 'Temprano',
        telefono: '222',
        fecha_hora: '2026-05-24T08:00:00Z',
        status: 'ACTIVE',
      },
    ];

    render(
      <KanbanBoard
        appointments={unsortedAppointments}
        onSelectPatient={mockOnSelectPatient}
      />
    );

    const cards = screen.getAllByText(/Tarde|Temprano/);
    expect(cards[0].textContent).toBe('Temprano');
    expect(cards[1].textContent).toBe('Tarde');
  });

  it('renders "Reenviar enlace" button only for PENDING_ONBOARDING appointments', () => {
    render(
      <KanbanBoard
        appointments={mockAppointments}
        onSelectPatient={mockOnSelectPatient}
      />
    );

    const resendButtons = screen.getAllByText('🔗 Reenviar enlace');
    expect(resendButtons.length).toBe(1);
  });

  it('triggers clipboard copy when "Reenviar enlace" is clicked', async () => {
    // Mock clipboard API and alert
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <KanbanBoard
        appointments={mockAppointments}
        onSelectPatient={mockOnSelectPatient}
      />
    );

    const button = screen.getByText('🔗 Reenviar enlace');
    fireEvent.click(button);

    await waitFor(() => expect(mockWriteText).toHaveBeenCalled());
    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('copiado al portapapeles')
    );

    alertSpy.mockRestore();
  });

  it('uses simple random fallback if crypto.randomUUID is not available', async () => {
    const originalRandomUUID = global.crypto?.randomUUID;
    if (global.crypto) {
      // @ts-ignore
      delete global.crypto.randomUUID;
    }

    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <KanbanBoard
        appointments={mockAppointments}
        onSelectPatient={mockOnSelectPatient}
      />
    );

    const button = screen.getByText('🔗 Reenviar enlace');
    fireEvent.click(button);

    await waitFor(() => expect(mockWriteText).toHaveBeenCalled());
    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('copiado al portapapeles')
    );

    alertSpy.mockRestore();

    if (originalRandomUUID && global.crypto) {
      global.crypto.randomUUID = originalRandomUUID;
    }
  });

  it('calls onSelectPatient when an ACTIVE or COMPLETED card is clicked', () => {
    render(
      <KanbanBoard
        appointments={mockAppointments}
        onSelectPatient={mockOnSelectPatient}
      />
    );

    const activeCard = screen.getByText('Maria Lopez').closest('div');
    expect(activeCard).toBeDefined();

    if (activeCard) {
      fireEvent.click(activeCard);
      expect(mockOnSelectPatient).toHaveBeenCalledWith(mockAppointments[1]);
    }
  });

  it('does not call onSelectPatient when a PENDING_ONBOARDING card is clicked', () => {
    mockOnSelectPatient.mockClear();

    render(
      <KanbanBoard
        appointments={mockAppointments}
        onSelectPatient={mockOnSelectPatient}
      />
    );

    const pendingCard = screen.getByText('Juan Perez').closest('div');
    expect(pendingCard).toBeDefined();

    if (pendingCard) {
      fireEvent.click(pendingCard);
      expect(mockOnSelectPatient).not.toHaveBeenCalled();
    }
  });
});
