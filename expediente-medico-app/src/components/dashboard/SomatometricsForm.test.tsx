import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SomatometricsForm } from './SomatometricsForm';

describe('SomatometricsForm Component', () => {
  it('renders all somatometrics fields and displays default IMC status', () => {
    render(<SomatometricsForm />);

    expect(screen.getByText(/📏 Somatometría/i)).toBeInTheDocument();
    expect(screen.getByText(/Peso \(kg\) \*/i)).toBeInTheDocument();
    expect(screen.getByText(/Talla \(cm\) \*/i)).toBeInTheDocument();
    expect(screen.getByText(/Presión Arterial \(mmHg\) \*/i)).toBeInTheDocument();

    // Default IMC rounded indicator shows '--'
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('renders only essential fields when tipoConsulta is General (default)', () => {
    render(<SomatometricsForm tipoConsulta="General" />);

    expect(screen.getByText('Datos Clínicos Esenciales')).toBeInTheDocument();
    expect(screen.queryByText('Composición Corporal y Silueta')).not.toBeInTheDocument();
    expect(screen.queryByText('Intervención / Tratamiento')).not.toBeInTheDocument();
  });

  it('renders optional composition and silueta cards when tipoConsulta is Control de Peso', () => {
    render(<SomatometricsForm tipoConsulta="Control de Peso" />);

    expect(screen.getByText('Datos Clínicos Esenciales')).toBeInTheDocument();
    expect(screen.getByText('Composición Corporal y Silueta')).toBeInTheDocument();
    expect(screen.getByText('Intervención / Tratamiento')).toBeInTheDocument();

    expect(screen.getByText('% Grasa')).toBeInTheDocument();
    expect(screen.getByText('% Músculo')).toBeInTheDocument();
    expect(screen.getByText('Cintura (cm)')).toBeInTheDocument();
    expect(screen.getByText('Cadera (cm)')).toBeInTheDocument();
    expect(screen.getByText('Busto (cm)')).toBeInTheDocument();
    expect(screen.getByText('Brazo (cm)')).toBeInTheDocument();
    expect(screen.getByText('Dosis aplicada (ml)')).toBeInTheDocument();
  });

  it('updates calculations dynamically in real time when user inputs peso and talla', () => {
    render(<SomatometricsForm />);

    const pesoInput = screen.getByPlaceholderText('ej. 72.5') as HTMLInputElement;
    const tallaInput = screen.getByPlaceholderText('ej. 170') as HTMLInputElement;

    // Type 70kg and 178cm
    fireEvent.change(pesoInput, { target: { value: '70' } });
    fireEvent.change(tallaInput, { target: { value: '178' } });

    // Expect correct computed IMC Rounded value '22.1'
    expect(screen.getByText('22.1')).toBeInTheDocument();
    
    // Expect correct WHO category badge 'Normal'
    expect(screen.getByText('Normal')).toBeInTheDocument();

    // Expect peso ideal to be rendered
    expect(screen.getByText(/Peso ideal estimado:/i)).toBeInTheDocument();
    expect(screen.getByText(/69.7 kg/i)).toBeInTheDocument();

    // Expect deviation badge to show positive delta (+0.3 kg sobre el ideal)
    expect(screen.getByText('+0.3 kg sobre el ideal')).toBeInTheDocument();
  });

  it('displays warning badge if systolic blood pressure is elevated (>= 140)', () => {
    render(<SomatometricsForm />);

    const sistolicaInput = screen.getByPlaceholderText('Sistólica') as HTMLInputElement;
    const diastolicaInput = screen.getByPlaceholderText('Diastólica') as HTMLInputElement;

    // Type normal BP values
    fireEvent.change(sistolicaInput, { target: { value: '120' } });
    fireEvent.change(diastolicaInput, { target: { value: '80' } });

    expect(screen.getByText('✓ Presión en rango normal')).toBeInTheDocument();

    // Type high BP values
    fireEvent.change(sistolicaInput, { target: { value: '145' } });
    expect(screen.getByText('⚠️ Presión elevada')).toBeInTheDocument();
  });

  it('enforces font-size 16px style on all numerical input elements to disable Safari auto-zoom', () => {
    render(<SomatometricsForm tipoConsulta="Control de Peso" />);

    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs.length).toBe(11); // 2 core + 2 BP + 6 composition/silueta + 1 dose

    inputs.forEach(input => {
      expect(input.style.fontSize).toBe('16px');
    });
  });

  it('disables input elements when readOnly prop is true', () => {
    render(<SomatometricsForm readOnly={true} tipoConsulta="Control de Peso" />);

    const pesoInput = screen.getByPlaceholderText('ej. 72.5') as HTMLInputElement;
    const tallaInput = screen.getByPlaceholderText('ej. 170') as HTMLInputElement;
    const sistolicaInput = screen.getByPlaceholderText('Sistólica') as HTMLInputElement;
    const diastolicaInput = screen.getByPlaceholderText('Diastólica') as HTMLInputElement;
    const grasaInput = screen.getByLabelText('% Grasa') as HTMLInputElement;
    const dosisInput = screen.getByPlaceholderText('ej. 1.5') as HTMLInputElement;

    expect(pesoInput).toBeDisabled();
    expect(tallaInput).toBeDisabled();
    expect(sistolicaInput).toBeDisabled();
    expect(diastolicaInput).toBeDisabled();
    expect(grasaInput).toBeDisabled();
    expect(dosisInput).toBeDisabled();
  });
});

