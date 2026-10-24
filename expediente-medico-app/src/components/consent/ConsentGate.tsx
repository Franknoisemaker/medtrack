import React, { useState, useEffect } from 'react';
import './ConsentWizard.css';

interface ConsentGateProps {
  token: string;
  onVerified: (sessionToken: string, consentId: string, patient: any) => void;
}

export const ConsentGate: React.FC<ConsentGateProps> = ({ token, onVerified }) => {
  const [idType, setIdType] = useState<'CURP' | 'RFC'>('CURP');
  const [idValue, setIdValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);

  const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]{2}$/;
  const RFC_REGEX = /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/;

  useEffect(() => {
    let interval: number;
    if (lockoutTime && lockoutTime > Date.now()) {
      interval = window.setInterval(() => {
        if (Date.now() >= lockoutTime) {
          setLockoutTime(null);
          setAttempts(0);
        } else {
          // Force re-render to update countdown
          setAttempts((a) => a);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [lockoutTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutTime && lockoutTime > Date.now()) return;

    setError('');
    const value = idValue.trim().toUpperCase();

    if (idType === 'CURP' && !CURP_REGEX.test(value)) {
      setError('CURP inválido. Verifica el formato.');
      return;
    }
    if (idType === 'RFC' && !RFC_REGEX.test(value)) {
      setError('RFC inválido. Verifica el formato.');
      return;
    }

    setLoading(true);

    try {
      const isMock = import.meta.env.VITE_SUPABASE_URL?.includes('your-project-id') || true;
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (isMock) {
        if ((idType === 'CURP' && value === 'GOLM850215MDFRPN09') || (idType === 'RFC' && value === 'GOLM850215AB3')) {
          onVerified('mock-session-token', 'mock-consent-id', {
            nombre: 'María González López',
            curpOrfc: value,
            tipoId: idType
          });
        } else {
          throw new Error('Identidad no verificada. Verifica tus datos.');
        }
      } else {
        // Real Edge Function call would go here
        // const response = await supabase.functions.invoke('verify-consent-gate', { body: { token, idType, idValue: value } });
        throw new Error('Not implemented');
      }
    } catch (err: any) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 3) {
        setLockoutTime(Date.now() + 15 * 60 * 1000); // 15 mins
        setError('Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.');
      } else {
        setError(err.message || 'Error de verificación');
      }
    } finally {
      setLoading(false);
    }
  };

  const remainingMinutes = lockoutTime ? Math.ceil((lockoutTime - Date.now()) / 60000) : 0;

  return (
    <div className="consent-step theme-zen">
      <div className="consent-progress-container">
        <div className="consent-progress-bar" style={{ width: '33%' }}></div>
        <div className="consent-progress-text">Paso 1 de 3</div>
      </div>
      
      <div className="card-glass consent-card">
        <div className="consent-header">
          <div className="consent-icon-container sky-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="consent-icon">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2>Verificación de Identidad</h2>
          <p className="consent-subtitle">El Dr. [nombre] te ha enviado un consentimiento informado para revisar y firmar</p>
        </div>

        <form onSubmit={handleSubmit} className="consent-form">
          <div className="consent-toggle">
            <button
              type="button"
              className={idType === 'CURP' ? 'active' : ''}
              onClick={() => setIdType('CURP')}
              disabled={loading || !!lockoutTime}
            >
              CURP
            </button>
            <button
              type="button"
              className={idType === 'RFC' ? 'active' : ''}
              onClick={() => setIdType('RFC')}
              disabled={loading || !!lockoutTime}
            >
              RFC
            </button>
          </div>

          <div className="consent-input-group">
            <label htmlFor="idValue">Ingresa tu {idType}</label>
            <input
              id="idValue"
              type="text"
              value={idValue}
              onChange={(e) => setIdValue(e.target.value.toUpperCase())}
              placeholder={idType === 'CURP' ? 'Ej. GOLM850215MDFRPN09' : 'Ej. GOLM850215AB3'}
              disabled={loading || !!lockoutTime}
              className="consent-input"
            />
          </div>

          {error && <div className="consent-error">{error}</div>}
          
          {lockoutTime && (
            <div className="consent-lockout">
              🔒 Bloqueado por {remainingMinutes} minuto{remainingMinutes !== 1 ? 's' : ''}
            </div>
          )}

          <button 
            type="submit" 
            className="consent-btn consent-btn-primary" 
            disabled={loading || !!lockoutTime || !idValue}
          >
            {loading ? <span className="consent-spinner"></span> : 'Verificar Identidad'}
          </button>
        </form>

        <div className="consent-footer">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          Tus datos están protegidos bajo NOM-024
        </div>
      </div>
    </div>
  );
};
