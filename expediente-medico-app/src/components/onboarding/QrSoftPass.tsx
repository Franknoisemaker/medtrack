import { useState, useEffect } from 'react';

interface QrSoftPassProps {
  consultaId: string;
  onClose: () => void;
}

export function QrSoftPass({ consultaId, onClose }: QrSoftPassProps) {
  const [opaqueToken] = useState(() => crypto.randomUUID());
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes TTL in seconds
  const [isExpired, setIsExpired] = useState(false);
  const [isUsed, setIsUsed] = useState(false);

  // Dynamic countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      setIsExpired(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // Format seconds as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Construct dynamic QR data carrying the opaque token
  const host = window.location.origin;
  let qrUrl = `${host}/?qr_token=${opaqueToken}`;
  if (qrUrl.includes('localhost') && qrUrl.startsWith('https://')) {
    qrUrl = qrUrl.replace('https://', 'http://');
  }
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrUrl)}`;

  const handleSimulateScan = () => {
    // High-fidelity local developer simulator:
    // Mark token as consumed and launch the receptionist terminal view
    setIsUsed(true);
    setTimeout(() => {
      // Direct redirect to simulate scan action
      window.location.href = qrUrl;
    }, 800);
  };

  return (
    <div className="card-glass" style={{ maxWidth: '400px', margin: '1.5rem auto', padding: '2rem 1.5rem', textAlign: 'center', transition: 'all 0.3s ease' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '0.5rem' }}>Pase QR de Recepción</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)', opacity: 0.7, lineHeight: 1.4, marginBottom: '1.25rem' }}>
        Muestra este código al personal de recepción para que habiliten el cuestionario asistido en la tableta del consultorio.
      </p>

      {isExpired ? (
        <div style={{ padding: '2rem 1rem', border: '1px dashed var(--color-error)', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', color: 'var(--color-error)' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>⏰</span>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>Pase QR Expirado</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '4px' }}>Este QR ha caducado. Por favor solicita uno nuevo.</div>
        </div>
      ) : isUsed ? (
        <div style={{ padding: '2rem 1rem', border: '1px dashed var(--color-success)', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.05)', color: 'var(--color-success)' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>✓</span>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>Pase QR Escaneado</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '4px' }}>Este QR ya fue escaneado. Transfiriendo control...</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          
          {/* QR Frame Panel */}
          <div style={{ padding: '12px', background: '#ffffff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.04)', display: 'inline-block' }}>
            <img 
              src={qrImageUrl} 
              alt="Security QR Soft-Pass"
              style={{ width: '200px', height: '200px', display: 'block' }} 
            />
          </div>

          {/* Countdown Clock */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-secondary)', fontFamily: 'monospace' }}>
              ⏳ {formatTime(timeLeft)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', opacity: 0.5 }}>Tiempo de validez restante</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
            {/* Local Simulator Assist Trigger */}
            <button
              onClick={handleSimulateScan}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(0,0,0,0.03)',
                border: '1px solid var(--color-border)',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--color-primary)',
                cursor: 'pointer'
              }}
            >
              ⚡ Simular Escaneo de Recepcionista
            </button>

            <button
              onClick={onClose}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'transparent',
                border: 'none',
                fontSize: '0.8rem',
                color: 'var(--color-primary)',
                opacity: 0.6,
                cursor: 'pointer'
              }}
            >
              Cerrar y Reintentar Soft-Gate
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
