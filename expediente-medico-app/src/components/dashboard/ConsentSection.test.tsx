import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConsentSection } from './ConsentSection';
import { SendConsentModal } from './SendConsentModal';

describe('Dashboard Consent Components', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve())
      }
    });
  });

  describe('ConsentSection', () => {
    it('renders consent section title and list of patient consents', async () => {
      render(
        <ConsentSection
          pacienteId="paciente-123"
          pacienteNombre="María González"
          pacienteTelefono="5512345678"
        />
      );

      expect(screen.getByText(/Consentimientos Informados/i)).toBeInTheDocument();
      expect(screen.getByText('Enviar Nuevo Consentimiento')).toBeInTheDocument();

      // Wait for mock data to load in test environment
      expect(await screen.findByText(/Consulta General/i)).toBeInTheDocument();
      expect(screen.getByText(/Control de Peso/i)).toBeInTheDocument();
    });

    it('opens SendConsentModal when clicking Enviar Nuevo Consentimiento', () => {
      render(
        <ConsentSection
          pacienteId="paciente-123"
          pacienteNombre="María González"
          pacienteTelefono="5512345678"
        />
      );

      const sendButton = screen.getByText('Enviar Nuevo Consentimiento');
      fireEvent.click(sendButton);

      expect(screen.getByText(/Enviar Consentimiento Informado/i)).toBeInTheDocument();
    });
  });

  describe('SendConsentModal', () => {
    it('renders template choices (Consulta General and Control de Peso) and allows selection', async () => {
      const handleClose = vi.fn();
      const handleSent = vi.fn();

      render(
        <SendConsentModal
          pacienteId="paciente-123"
          pacienteNombre="María González"
          pacienteTelefono="5512345678"
          onClose={handleClose}
          onSent={handleSent}
        />
      );

      expect(screen.getByText(/María González/i)).toBeInTheDocument();
      expect(screen.getByText('Consulta General')).toBeInTheDocument();
      expect(screen.getByText('Control de Peso')).toBeInTheDocument();

      const pesoCard = screen.getByText('Control de Peso').closest('div');
      if (pesoCard) {
        fireEvent.click(pesoCard);
      }

      const generateButton = screen.getByText(/Generar y Copiar Enlace/i);
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(handleSent).toHaveBeenCalledTimes(1);
      });
    });
  });
});
