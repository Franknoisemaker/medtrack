import React, { useState } from 'react';
import './ConsentWizard.css';

interface ConsentViewerProps {
  contenido: {
    secciones: Array<{ titulo: string; contenido: string; expandido_por_defecto?: boolean }>;
  };
  templateTitulo: string;
  onAccept: () => void;
}

export const ConsentViewer: React.FC<ConsentViewerProps> = ({ contenido, templateTitulo, onAccept }) => {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set(
    contenido.secciones.map((s, i) => s.expandido_por_defecto ? i : -1).filter(i => i !== -1)
  ));
  const [accepted, setAccepted] = useState(false);

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  return (
    <div className="consent-step theme-zen">
      <div className="consent-progress-container">
        <div className="consent-progress-bar" style={{ width: '66%' }}></div>
        <div className="consent-progress-text">Paso 2 de 3</div>
      </div>
      
      <div className="card-glass consent-card consent-viewer-card">
        <div className="consent-header">
          <span className="consent-badge sky-blue">{templateTitulo}</span>
          <h2>Revisión de Consentimiento</h2>
          <p className="consent-subtitle">Lee cuidadosamente el siguiente documento</p>
        </div>

        <div className="consent-accordion-container">
          {contenido.secciones.map((seccion, idx) => (
            <div key={idx} className={`consent-accordion-item ${expandedSections.has(idx) ? 'expanded' : ''}`}>
              <button 
                className="consent-accordion-header" 
                onClick={() => toggleSection(idx)}
              >
                <h3>{seccion.titulo}</h3>
                <span className="consent-accordion-icon">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expandedSections.has(idx) ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}>
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </span>
              </button>
              <div className="consent-accordion-content" style={{ maxHeight: expandedSections.has(idx) ? '1000px' : '0', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                <div className="consent-accordion-inner">
                  {seccion.contenido.split('\n').map((para, i) => <p key={i}>{para}</p>)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="consent-acceptance">
          <label className="consent-checkbox-label">
            <input 
              type="checkbox" 
              checked={accepted} 
              onChange={(e) => setAccepted(e.target.checked)} 
              className="consent-checkbox"
            />
            <span>He leído y comprendo el contenido de este documento</span>
          </label>
        </div>

        <button 
          onClick={onAccept} 
          disabled={!accepted} 
          className="consent-btn consent-btn-primary"
        >
          Continuar a Firma →
        </button>
      </div>
    </div>
  );
};
