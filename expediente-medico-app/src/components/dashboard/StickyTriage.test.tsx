import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StickyTriage } from './StickyTriage';

describe('StickyTriage Component', () => {
  const mockPatientName = 'Juan Perez';
  const mockConsultaId = 'consulta-uuid-123';

  const mockTriageData = {
    alergias: 'Penicilina',
    medicamentos: 'Metformina 850mg',
    padecimientos_cifrado: 'Diabetes Mellitus Tipo 2',
    motivo_consulta_cifrado: 'Control trimestral de glucosa',
  };

  it('renders patient name correctly', () => {
    render(
      <StickyTriage
        patientName={mockPatientName}
        consultaId={mockConsultaId}
        triage={null}
      />
    );

    expect(screen.getByText('Paciente')).toBeDefined();
    expect(screen.getByText(mockPatientName)).toBeDefined();
  });

  it('renders "Ficha clínica pendiente" placeholder when triage is null', () => {
    render(
      <StickyTriage
        patientName={mockPatientName}
        consultaId={mockConsultaId}
        triage={null}
      />
    );

    expect(screen.getByText(/Ficha clínica pendiente/i)).toBeDefined();
    expect(screen.queryByText('🚨 ALERGIAS')).toBeNull();
  });

  it('renders triage details correctly when data is provided', () => {
    render(
      <StickyTriage
        patientName={mockPatientName}
        consultaId={mockConsultaId}
        triage={mockTriageData}
      />
    );

    expect(screen.getByText('Penicilina')).toBeDefined();
    expect(screen.getByText('Metformina 850mg')).toBeDefined();
    expect(screen.getByText('Diabetes Mellitus Tipo 2')).toBeDefined();
    expect(screen.getByText('Control trimestral de glucosa')).toBeDefined();
  });

  it('handles "Ninguno" or "Ninguna" values with success stylings', () => {
    const triageWithNones = {
      alergias: 'Ninguna',
      medicamentos: 'Ninguno',
      padecimientos_cifrado: 'Ninguno',
      motivo_consulta_cifrado: 'Revisión anual',
    };

    render(
      <StickyTriage
        patientName={mockPatientName}
        consultaId={mockConsultaId}
        triage={triageWithNones}
      />
    );

    expect(screen.getByText('Sin alergias conocidas ✓')).toBeDefined();
    expect(screen.getByText('Sin medicamentos actuales')).toBeDefined();
  });

  it('handles lowercase and spaced "ninguna" or "ninguno" values gracefully', () => {
    const triageWithNonesSpaced = {
      alergias: ' ninguna  ',
      medicamentos: 'NINGUNO',
      padecimientos_cifrado: 'ninguno',
      motivo_consulta_cifrado: 'Consulta general',
    };

    render(
      <StickyTriage
        patientName={mockPatientName}
        consultaId={mockConsultaId}
        triage={triageWithNonesSpaced}
      />
    );

    expect(screen.getByText('Sin alergias conocidas ✓')).toBeDefined();
    expect(screen.getByText('Sin medicamentos actuales')).toBeDefined();
  });

  it('displays the NOM-024 compliance footer note', () => {
    render(
      <StickyTriage
        patientName={mockPatientName}
        consultaId={mockConsultaId}
        triage={mockTriageData}
      />
    );

    expect(screen.getByText(/NOM-024/i)).toBeDefined();
  });

  it('displays age calculated from birthdate continuously', () => {
    const triageWithBirthdate = {
      ...mockTriageData,
      fecha_nacimiento: '1990-05-15',
    };

    render(
      <StickyTriage
        patientName={mockPatientName}
        consultaId={mockConsultaId}
        triage={triageWithBirthdate}
      />
    );

    expect(screen.getByText(/años/i)).toBeDefined();
  });
});
