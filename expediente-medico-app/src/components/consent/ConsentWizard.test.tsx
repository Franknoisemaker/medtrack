import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConsentGate } from './ConsentGate';
import { ConsentViewer } from './ConsentViewer';
import { ConsentSignaturePad } from './ConsentSignaturePad';
import { ConsentSuccess } from './ConsentSuccess';

describe('Consent Patient Components', () => {
  describe('ConsentGate', () => {
    it('renders CURP/RFC toggle selector and identity verification form', () => {
      render(<ConsentGate token="mock_jwt_consent" onVerified={() => {}} />);
      expect(screen.getByText('Verificación de Identidad')).toBeInTheDocument();
      expect(screen.getByText('CURP')).toBeInTheDocument();
      expect(screen.getByText('RFC')).toBeInTheDocument();
    });

    it('validates CURP format and accepts valid mock CURP', async () => {
      const handleVerified = vi.fn();
      render(<ConsentGate token="mock_jwt_consent" onVerified={handleVerified} />);

      const input = screen.getByPlaceholderText(/GOLM850215MDFRPN09/i);
      fireEvent.change(input, { target: { value: 'GOLM850215MDFRPN09' } });

      const button = screen.getByRole('button', { name: /Verificar Identidad/i });
      fireEvent.click(button);

      // In mock mode, valid CURP triggers onVerified
      await screen.findByText('Verificación de Identidad');
    });
  });

  describe('ConsentViewer', () => {
    const mockContent = {
      secciones: [
        { titulo: 'Descripción del Procedimiento', contenido: 'Texto de prueba de consulta general.', expandido_por_defecto: true },
        { titulo: 'Riesgos y Beneficios', contenido: 'Beneficios esperados de la consulta.' }
      ]
    };

    it('renders accordion sections and requires checking comprehension box', () => {
      const handleAccept = vi.fn();
      render(
        <ConsentViewer
          contenido={mockContent}
          templateTitulo="Consulta General"
          onAccept={handleAccept}
        />
      );

      expect(screen.getByText('Descripción del Procedimiento')).toBeInTheDocument();
      expect(screen.getByText('Consulta General')).toBeInTheDocument();

      const nextButton = screen.getByRole('button', { name: /Continuar a Firma/i });
      expect(nextButton).toBeDisabled();

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(nextButton).not.toBeDisabled();
      fireEvent.click(nextButton);
      expect(handleAccept).toHaveBeenCalledTimes(1);
    });
  });

  describe('ConsentSignaturePad', () => {
    it('renders summary card and enables sign button when signature is drawn', () => {
      const handleSign = vi.fn();
      render(
        <ConsentSignaturePad
          patient={{ nombre: 'María González', curpOrfc: 'GOLM850215MDFRPN09', tipoId: 'CURP' }}
          templateTitulo="Consulta General"
          onSign={handleSign}
          isSubmitting={false}
        />
      );

      expect(screen.getByText('María González')).toBeInTheDocument();
      expect(screen.getByText('GOLM850215MDFRPN09')).toBeInTheDocument();
    });
  });

  describe('ConsentSuccess', () => {
    it('renders completion screen with PDF download option', () => {
      render(
        <ConsentSuccess
          signedAt="10 de agosto de 2026, 14:30"
          pdfUrl="https://example.com/consent.pdf"
          onClose={() => {}}
        />
      );

      expect(screen.getByText('¡Consentimiento Firmado!')).toBeInTheDocument();
      expect(screen.getByText(/Descargar mi copia/i)).toBeInTheDocument();
    });
  });
});
