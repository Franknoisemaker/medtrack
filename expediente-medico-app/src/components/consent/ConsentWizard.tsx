import React, { useState } from 'react';
import { ConsentGate } from './ConsentGate';
import { ConsentViewer } from './ConsentViewer';
import { ConsentSignaturePad } from './ConsentSignaturePad';
import { ConsentSuccess } from './ConsentSuccess';
import './ConsentWizard.css';

interface ConsentWizardProps {
  token: string;
  onComplete?: () => void;
}

export const ConsentWizard: React.FC<ConsentWizardProps> = ({ token, onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [consentId, setConsentId] = useState<string | null>(null);
  const [patient, setPatient] = useState<{ nombre: string; curpOrfc: string; tipoId: 'CURP' | 'RFC' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | undefined>();
  const [signedAt, setSignedAt] = useState<string | null>(null);

  // Mock content
  const mockContent = {
    templateTitulo: 'Consulta General',
    contenido: {
      secciones: [
        {
          titulo: 'I. Naturaleza del Tratamiento',
          contenido: 'Por medio del presente documento, otorgo mi consentimiento al médico tratante para llevar a cabo la evaluación y atención médica necesaria.',
          expandido_por_defecto: true
        },
        {
          titulo: 'II. Riesgos y Beneficios',
          contenido: 'He sido informado(a) sobre los posibles riesgos y beneficios asociados con el tratamiento médico. Comprendo que la medicina no es una ciencia exacta y no se garantizan resultados específicos.',
          expandido_por_defecto: false
        },
        {
          titulo: 'III. Privacidad y Manejo de Datos',
          contenido: 'Mis datos serán tratados conforme a la NOM-004-SSA3-2012 y la NOM-024-SSA3-2012, garantizando la confidencialidad de mi expediente clínico.',
          expandido_por_defecto: false
        }
      ]
    }
  };

  const handleVerified = (token: string, cid: string, patientData: any) => {
    setSessionToken(token);
    setConsentId(cid);
    setPatient(patientData);
    setStep(2);
  };

  const handleAccept = () => {
    setStep(3);
  };

  const handleSign = async (firmaBase64: string) => {
    setIsSubmitting(true);
    try {
      const isMock = import.meta.env.VITE_SUPABASE_URL?.includes('your-project-id') || true;
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (isMock) {
        setPdfUrl('https://example.com/mock-signed-consent.pdf');
        setSignedAt(new Date().toISOString());
        setStep(4);
      } else {
        // Real Edge Function call
        // const response = await supabase.functions.invoke('sign-consent', { ... });
        throw new Error('Not implemented');
      }
    } catch (error) {
      console.error('Error signing consent:', error);
      alert('Hubo un error al guardar la firma. Por favor intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Memory purge
    setStep(1);
    setSessionToken(null);
    setConsentId(null);
    setPatient(null);
    setPdfUrl(undefined);
    setSignedAt(null);
    
    // Prevent back navigation
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.href);
    }
    
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <div className="consent-wizard-container">
      {isSubmitting && (
        <div className="consent-loading-overlay">
          <div className="consent-spinner large"></div>
          <p>Procesando firma...</p>
        </div>
      )}
      
      {step === 1 && (
        <ConsentGate token={token} onVerified={handleVerified} />
      )}
      
      {step === 2 && (
        <ConsentViewer 
          contenido={mockContent.contenido} 
          templateTitulo={mockContent.templateTitulo} 
          onAccept={handleAccept} 
        />
      )}
      
      {step === 3 && patient && (
        <ConsentSignaturePad 
          patient={patient} 
          templateTitulo={mockContent.templateTitulo} 
          onSign={handleSign} 
          isSubmitting={isSubmitting} 
        />
      )}
      
      {step === 4 && signedAt && (
        <ConsentSuccess 
          pdfUrl={pdfUrl} 
          signedAt={signedAt} 
          onClose={handleClose} 
        />
      )}
    </div>
  );
};
