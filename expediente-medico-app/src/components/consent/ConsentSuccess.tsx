import React from 'react';
import './ConsentWizard.css';

interface ConsentSuccessProps {
  pdfUrl?: string;
  signedAt: string;
  onClose: () => void;
}

export const ConsentSuccess: React.FC<ConsentSuccessProps> = ({ pdfUrl, signedAt, onClose }) => {
  
  const handleDownload = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    } else {
      alert('El PDF estará disponible en breve.');
    }
  };

  return (
    <div className="consent-step theme-zen consent-success-view">
      <div className="card-glass consent-card">
        
        <div className="consent-success-icon-container">
          <div className="consent-success-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="consent-check-icon">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>

        <div className="consent-header" style={{ marginTop: '20px' }}>
          <h2>¡Consentimiento Firmado!</h2>
          <p className="consent-subtitle">Tu consentimiento ha sido registrado exitosamente</p>
        </div>

        <div className="consent-summary-card success-border">
          <div className="consent-summary-row">
            <span className="consent-summary-label">Fecha de Firma:</span>
            <span className="consent-summary-value">{new Date(signedAt).toLocaleString()}</span>
          </div>
          <div className="consent-summary-row">
            <span className="consent-summary-label">Estado:</span>
            <span className="consent-summary-value success-text">Documento sellado digitalmente</span>
          </div>
          <div className="consent-summary-row">
            <span className="consent-summary-label">Legal:</span>
            <span className="consent-summary-value">Cumplimiento NOM-004-SSA3-2012</span>
          </div>
        </div>

        <div className="consent-success-actions">
          <button 
            onClick={handleDownload} 
            className="consent-btn consent-btn-outline-primary"
          >
            📥 Descargar mi copia (PDF)
          </button>
          
          <button 
            onClick={onClose} 
            className="consent-btn consent-btn-text"
          >
            Cerrar ventana
          </button>
        </div>

        <div className="consent-footer">
          Si tienes dudas, contacta a tu médico directamente.
        </div>
        
        <div className="consent-muted-text">
          🔒 Puedes cerrar esta pestaña de forma segura
        </div>
      </div>
    </div>
  );
};
