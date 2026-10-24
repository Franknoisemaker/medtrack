import React, { useRef, useState, useEffect } from 'react';
import './ConsentWizard.css';

interface ConsentSignaturePadProps {
  patient: { nombre: string; curpOrfc: string; tipoId: 'CURP' | 'RFC' };
  templateTitulo: string;
  onSign: (firma_base64: string) => void;
  isSubmitting: boolean;
}

export const ConsentSignaturePad: React.FC<ConsentSignaturePadProps> = ({ patient, templateTitulo, onSign, isSubmitting }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        // Save current content if any
        const dataUrl = hasDrawn ? canvas.toDataURL() : null;
        
        canvas.width = container.clientWidth;
        canvas.height = 200; // Fixed height
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          if (dataUrl && hasDrawn) {
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
            };
            img.src = dataUrl;
          }
        }
      }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [hasDrawn]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    setHasDrawn(true);
    draw(e);
  };

  const endDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.beginPath();
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    }
  };

  const handleSign = () => {
    const canvas = canvasRef.current;
    if (canvas && hasDrawn) {
      const dataUrl = canvas.toDataURL('image/png');
      onSign(dataUrl);
    }
  };

  return (
    <div className="consent-step theme-zen">
      <div className="consent-progress-container">
        <div className="consent-progress-bar" style={{ width: '90%' }}></div>
        <div className="consent-progress-text">Paso 3 de 3</div>
      </div>
      
      <div className="card-glass consent-card">
        <div className="consent-header">
          <h2>Firma de Conformidad</h2>
        </div>

        <div className="consent-summary-card">
          <div className="consent-summary-row">
            <span className="consent-summary-label">Paciente:</span>
            <span className="consent-summary-value">{patient.nombre}</span>
          </div>
          <div className="consent-summary-row">
            <span className="consent-summary-label">{patient.tipoId}:</span>
            <span className="consent-summary-value">{patient.curpOrfc}</span>
          </div>
          <div className="consent-summary-row">
            <span className="consent-summary-label">Documento:</span>
            <span className="consent-summary-value">{templateTitulo}</span>
          </div>
          <div className="consent-summary-row">
            <span className="consent-summary-label">Fecha:</span>
            <span className="consent-summary-value">{new Date().toLocaleString()}</span>
          </div>
        </div>

        <div className="consent-signature-container">
          <div className="consent-signature-header">
            <span>Dibuja tu firma aquí</span>
            <button type="button" className="consent-btn-text" onClick={handleClear}>Limpiar</button>
          </div>
          <div className="consent-canvas-wrapper" ref={containerRef}>
            <canvas
              ref={canvasRef}
              className="consent-signature-canvas"
              onMouseDown={startDrawing}
              onMouseUp={endDrawing}
              onMouseOut={endDrawing}
              onMouseMove={draw}
              onTouchStart={startDrawing}
              onTouchEnd={endDrawing}
              onTouchMove={draw}
            />
          </div>
        </div>
        
        <p className="consent-disclaimer">
          Al firmar, confirmo que he leído y acepto los términos del consentimiento.
        </p>

        <button 
          onClick={handleSign} 
          disabled={!hasDrawn || isSubmitting} 
          className="consent-btn consent-btn-success"
        >
          {isSubmitting ? <span className="consent-spinner"></span> : '✓ Firmar Consentimiento'}
        </button>
      </div>
    </div>
  );
};
