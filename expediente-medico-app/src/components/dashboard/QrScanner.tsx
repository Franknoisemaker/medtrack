import { useState, useEffect } from 'react';

interface QrScannerProps {
  qrToken: string;
  onSuccess: (sessionToken: string, consultaId: string) => void;
}

export function QrScanner({ qrToken, onSuccess }: QrScannerProps) {
  const [isValidating, setIsValidating] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const validateQrPass = async () => {
      setIsValidating(true);
      setErrorMsg(null);

      try {
        // High-fidelity local developer simulator:
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Validation triggers based on simulated UUID segments or sessions
        if (qrToken.includes('expired') || qrToken.endsWith('-e1')) {
          setErrorMsg('Este QR ha caducado.');
        } else if (qrToken.includes('reused') || qrToken.endsWith('-r2') || sessionStorage.getItem(`used_qr_${qrToken}`)) {
          setErrorMsg('Este QR ya fue escaneado.');
        } else {
          // Consume the QR pass to prevent replay attacks
          sessionStorage.setItem(`used_qr_${qrToken}`, 'true');
          
          // Successful verification yields a write-only assisted session token
          onSuccess(
            `mock_assisted_session_${crypto.randomUUID()}`,
            '550e8400-e29b-41d4-a716-446655440000'
          );
        }
      } catch (err) {
        console.error(err);
        setErrorMsg('Error en la verificación. Intente escanear nuevamente.');
      } finally {
        setIsValidating(false);
      }
    };

    validateQrPass();
  }, [qrToken]);

  return (
    <div className="card-glass" style={{ maxWidth: '440px', margin: '3rem auto', padding: '2.5rem 2rem', textAlign: 'center', borderTop: '4px solid var(--color-secondary)' }}>
      
      {isValidating ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
          <span style={{ fontSize: '3rem', animation: 'spin 2s infinite linear' }}>🔄</span>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-primary)' }}>Validando Pase QR...</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)', opacity: 0.6 }}>
            Verificando credenciales de acceso perimetral NOM-024. Por favor espere.
          </p>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 2rem' }}>
            <div style={{ height: '14px', background: 'var(--color-border)', borderRadius: '4px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
            <div style={{ height: '14px', background: 'var(--color-border)', borderRadius: '4px', width: '80%', margin: '0 auto', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
          </div>
        </div>
      ) : errorMsg ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
          <span style={{ fontSize: '3.5rem' }}>⚠️</span>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-error)' }}>Acceso Rechazado</h3>
          <div style={{
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            fontSize: '0.85rem',
            fontWeight: 600,
            width: '100%',
            boxSizing: 'border-box'
          }}>
            {errorMsg}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)', opacity: 0.7, lineHeight: 1.4 }}>
            El pase presentado no es válido para esta consulta. Solicita un nuevo código QR al paciente o agenda una cita de contingencia.
          </p>
          <button
            onClick={() => (window.location.href = window.location.origin)}
            style={{
              marginTop: '0.75rem',
              padding: '10px 20px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-primary)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.9rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Volver al Dashboard
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
          <span style={{ fontSize: '3.5rem', color: 'var(--color-success)' }}>✓</span>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success)' }}>Pase Validado</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)', opacity: 0.7 }}>
            Acceso concedido en modo asistido. Transfiriendo control de la terminal...
          </p>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 0.9; }
          100% { opacity: 0.6; }
        }
      `}} />
    </div>
  );
}
