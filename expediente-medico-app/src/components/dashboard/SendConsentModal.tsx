import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';

interface SendConsentModalProps {
  pacienteId: string;
  pacienteNombre: string;
  pacienteTelefono: string;
  medicoId?: string;
  onClose: () => void;
  onSent: () => void;
}

type TemplateType = 'general' | 'peso';

const SendConsentModal: React.FC<SendConsentModalProps> = ({
  pacienteId,
  pacienteNombre,
  pacienteTelefono,
  medicoId,
  onClose,
  onSent
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('general');
  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  const firstName = pacienteNombre.split(' ')[0] || 'Paciente';
  const medicoNombre = 'Doctor'; // Ideally fetched from context

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleGenerateLink = async () => {
    setIsGenerating(true);
    try {
      const isMock = import.meta.env.VITE_SUPABASE_URL?.includes('your-project-id') || true;
      let shortUrl = '';

      if (isMock) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        shortUrl = `https://medtrack.mx/c/MOCK${Math.floor(Math.random() * 1000)}`;
      } else {
        // Call edge function in production
        const { data, error } = await supabase.functions.invoke('create-consent', {
          body: { 
            pacienteId, 
            medicoId, 
            template: selectedTemplate 
          }
        });
        
        if (error) throw error;
        shortUrl = data.shortUrl || 'https://medtrack.mx/c/fallback';
      }

      const whatsappMessage = `Hola ${firstName}, el Dr. ${medicoNombre} te ha enviado un consentimiento informado para revisar y firmar. Abre el siguiente enlace: ${shortUrl}`;
      
      await navigator.clipboard.writeText(whatsappMessage);
      
      setToastMessage('¡Mensaje copiado al portapapeles!');
      onSent();
      setTimeout(() => {
        setToastMessage('');
      }, 2000);

    } catch (error) {
      console.error('Error generating consent link:', error);
      alert('Hubo un error al generar el enlace.');
    } finally {
      setIsGenerating(false);
    }
  };

  const getPreviewText = () => {
    if (selectedTemplate === 'general') {
      return "Autorizo a mi médico a realizar la evaluación clínica, diagnóstico y tratamiento de mi estado de salud general. Comprendo los riesgos y beneficios de los procedimientos médicos rutinarios y acepto proporcionar información veraz sobre mis antecedentes.";
    }
    return "Consiento participar en el programa de control de peso. Entiendo que los resultados dependen de mi adherencia a las indicaciones dietéticas y de estilo de vida, y autorizo el registro de mis medidas corporales y fotografías clínicas para mi expediente.";
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }} onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '24px',
        width: '100%',
        maxWidth: '560px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }} className="theme-tactical">
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-primary, #0f172a)' }}>
            📤 Enviar Consentimiento Informado
          </h2>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#94a3b8', cursor: 'pointer', padding: '0 8px' }}
          >
            &times;
          </button>
        </div>

        <div style={{
          backgroundColor: 'var(--color-bg, #f1f5f9)',
          padding: '12px',
          borderRadius: '6px',
          color: '#475569',
          fontSize: '0.875rem',
          borderLeft: '4px solid var(--color-secondary, #0284c7)'
        }}>
          <strong>Paciente:</strong> {pacienteNombre} | <strong>Tel:</strong> {pacienteTelefono}
        </div>

        <div>
          <h4 style={{ margin: '0 0 12px 0', color: '#334155', fontSize: '0.9rem' }}>Seleccionar Plantilla</h4>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div 
              onClick={() => setSelectedTemplate('general')}
              style={{
                flex: 1,
                border: `2px solid ${selectedTemplate === 'general' ? 'var(--color-secondary, #0284c7)' : '#e2e8f0'}`,
                borderRadius: '8px',
                padding: '16px',
                cursor: 'pointer',
                textAlign: 'center',
                backgroundColor: selectedTemplate === 'general' ? '#f0f9ff' : 'white',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🩺</div>
              <div style={{ fontWeight: 600, color: selectedTemplate === 'general' ? 'var(--color-secondary, #0284c7)' : '#64748b' }}>
                Consulta General
              </div>
            </div>
            <div 
              onClick={() => setSelectedTemplate('peso')}
              style={{
                flex: 1,
                border: `2px solid ${selectedTemplate === 'peso' ? '#0d9488' : '#e2e8f0'}`,
                borderRadius: '8px',
                padding: '16px',
                cursor: 'pointer',
                textAlign: 'center',
                backgroundColor: selectedTemplate === 'peso' ? '#f0fdfa' : 'white',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚖️</div>
              <div style={{ fontWeight: 600, color: selectedTemplate === 'peso' ? '#0d9488' : '#64748b' }}>
                Control de Peso
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 style={{ margin: '0 0 8px 0', color: '#334155', fontSize: '0.9rem' }}>Vista Previa del Texto</h4>
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '12px',
            fontSize: '0.875rem',
            color: '#64748b',
            fontStyle: 'italic',
            lineHeight: 1.5
          }}>
            "{getPreviewText()}"
          </div>
        </div>

        <div>
          <h4 style={{ margin: '0 0 8px 0', color: '#334155', fontSize: '0.9rem' }}>Mensaje para WhatsApp</h4>
          <div style={{
            backgroundColor: '#dcf8c6',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '0.875rem',
            color: '#111827',
            position: 'relative'
          }}>
            Hola {firstName}, el Dr. {medicoNombre} te ha enviado un consentimiento informado para revisar y firmar. Abre el siguiente enlace: <strong>[Enlace único]</strong>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
          <button 
            onClick={onClose}
            disabled={isGenerating}
            style={{
              padding: '10px 16px',
              backgroundColor: 'transparent',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              color: '#475569',
              fontWeight: 500,
              cursor: isGenerating ? 'not-allowed' : 'pointer'
            }}
          >
            Cancelar
          </button>
          <button 
            onClick={handleGenerateLink}
            disabled={isGenerating}
            style={{
              padding: '10px 16px',
              backgroundColor: 'var(--color-secondary, #0284c7)',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              fontWeight: 600,
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.2s'
            }}
          >
            {isGenerating ? 'Generando...' : 'Generar y Copiar Enlace'}
          </button>
        </div>

        {toastMessage && (
          <div style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#10b981',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '0.875rem',
            fontWeight: 500,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            zIndex: 1010
          }}>
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  );
};

export { SendConsentModal };
