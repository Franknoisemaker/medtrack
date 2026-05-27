import React, { useState, useEffect } from 'react';
import { QrSoftPass } from './QrSoftPass';

interface SoftGateFormProps {
  token: string;
  onVerified: (sessionToken: string, consultaId: string) => void;
}

export function SoftGateForm({ token, onVerified }: SoftGateFormProps) {
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [telefono, setTelefono] = useState('');
  
  // States for server response and UI flow
  const [isLoading, setIsLoading] = useState(false);
  const [isMalformed, setIsMalformed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
  const [isAlreadyCompleted, setIsAlreadyCompleted] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // Parse token formatting on mount
  useEffect(() => {
    const isMockToken = token && token.startsWith('mock_jwt_');
    if (!token || (token.split('.').length !== 3 && !isMockToken)) {
      setIsMalformed(true);
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fechaNacimiento || !telefono) {
      setErrorMessage('Por favor ingresa ambos campos para continuar.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
      const isMock = supabaseUrl.includes('your-project-id');

      let responseData;

      if (isMock) {
        // High fidelity mock flow for local/sandbox development
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        // Dynamic Single-Use JTI Replay Prevention for mockups
        const usedMockTokens = JSON.parse(sessionStorage.getItem('used_mock_tokens') || '[]');
        if (usedMockTokens.includes(token)) {
          responseData = { success: false, error: { code: 'TOKEN_ALREADY_USED' } };
        } else {
          // Custom interactive test credentials in mockup:
          // Use phone "5512345678" and birthdate "1990-05-15" to pass,
          // any other values will increment mock failures
          const cleanInputPhone = telefono.replace(/\D/g, '').slice(-10);
          
          if (cleanInputPhone === '5512345678' && fechaNacimiento === '1990-05-15') {
            // Track this token as consumed to prevent replay reuse
            usedMockTokens.push(token);
            sessionStorage.setItem('used_mock_tokens', JSON.stringify(usedMockTokens));

            responseData = {
              success: true,
              data: {
                consulta_id: '550e8400-e29b-41d4-a716-446655440000',
                session_token: `mock_session_${crypto.randomUUID()}`,
              },
            };
          } else if (telefono === '9999999999') {
            // Special mockup trigger for ALREADY_COMPLETED
            responseData = {
              success: true,
              data: { status: 'ALREADY_COMPLETED' }
            };
          } else if (telefono === '8888888888') {
            // Special mockup trigger for TOKEN_ALREADY_USED
            responseData = { success: false, error: { code: 'TOKEN_ALREADY_USED' } };
          } else if (telefono === '7777777777') {
            // Special mockup trigger for TOKEN_EXPIRED
            responseData = { success: false, error: { code: 'TOKEN_EXPIRED' } };
          } else {
            // Track mock failed attempts using sessionStorage
            const failedCount = parseInt(sessionStorage.getItem('failed_attempts') || '0') + 1;
            sessionStorage.setItem('failed_attempts', failedCount.toString());
            
            if (failedCount >= 3) {
              responseData = {
                success: false,
                error: {
                  code: 'AUTH_BLOCKED',
                  blocked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
                },
              };
            } else {
              responseData = {
                success: false,
                error: {
                  code: 'INVALID_CREDENTIALS',
                  attempts_remaining: 3 - failedCount,
                },
              };
            }
          }
        }
      } else {
        const response = await fetch(`${supabaseUrl}/functions/v1/auth-gate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token, fecha_nacimiento: fechaNacimiento, telefono }),
        });

        responseData = await response.json();
      }

      if (responseData.success) {
        // Clear mock failed attempts counter upon successful verification
        sessionStorage.removeItem('failed_attempts');

        if (responseData.data.status === 'ALREADY_COMPLETED') {
          setIsAlreadyCompleted(true);
        } else {
          onVerified(responseData.data.session_token, responseData.data.consulta_id, responseData.data.patient);
        }
      } else {
        const error = responseData.error || {};
        switch (error.code) {
          case 'TOKEN_ALREADY_USED':
            setErrorMessage('Este enlace ya fue utilizado. Contacta a tu médico.');
            break;
          case 'TOKEN_EXPIRED':
            setErrorMessage('Este enlace ha caducado. Contacta a tu médico.');
            break;
          case 'INVALID_CREDENTIALS':
            setErrorMessage(`Los datos no coinciden. Intento ${3 - error.attempts_remaining} de 3.`);
            break;
          case 'AUTH_BLOCKED':
            setIsBlocked(true);
            setBlockedUntil(error.blocked_until);
            setErrorMessage('Por seguridad, este enlace está bloqueado 15 minutos.');
            break;
          default:
            setErrorMessage('No se pudo verificar la información. Por favor, reintente.');
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Ocurrió un error en la conexión. Por favor reintente más tarde.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isMalformed) {
    return (
      <div className="card-glass" style={{ maxWidth: '420px', margin: '2rem auto', padding: '2.5rem 2rem', textAlign: 'center', borderTop: '4px solid var(--color-error)' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.4rem', color: 'var(--color-primary)', fontWeight: 700, marginBottom: '0.75rem' }}>Enlace Inválido</h2>
        <p style={{ fontSize: '0.95rem', color: 'var(--color-primary)', opacity: 0.8, lineHeight: 1.5 }}>
          Este enlace no es válido o ha sido modificado. Solicita uno nuevo a tu médico de cabecera.
        </p>
      </div>
    );
  }

  if (isAlreadyCompleted) {
    return (
      <div className="card-glass" style={{ maxWidth: '420px', margin: '2rem auto', padding: '2.5rem 2rem', textAlign: 'center', borderTop: '4px solid var(--color-success)' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>✓</div>
        <h2 style={{ fontSize: '1.4rem', color: 'var(--color-success)', fontWeight: 700, marginBottom: '0.75rem' }}>Registro Completado</h2>
        <p style={{ fontSize: '0.95rem', color: 'var(--color-primary)', opacity: 0.8, lineHeight: 1.5 }}>
          Tu información médica y antecedentes clínicos ya fueron registrados exitosamente. ¡Muchas gracias!
        </p>
      </div>
    );
  }

  if (showQr) {
    return (
      <div className="theme-zen" style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '2rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <QrSoftPass consultaId="550e8400-e29b-41d4-a716-446655440000" onClose={() => setShowQr(false)} />
      </div>
    );
  }

  return (
    <div className="theme-zen" style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '2rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card-glass" style={{ maxWidth: '440px', width: '100%', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.03)', transition: 'all 0.3s ease' }}>
        
        {/* Clinic Branding */}
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '2.25rem', display: 'block', marginBottom: '0.5rem' }}>🛡️</span>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '-0.02em' }}>Verificar Identidad</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)', opacity: 0.6, marginTop: '2px' }}>MedTrack Secure Patient Onboarding</p>
        </div>

        {/* Pedagogic Panel */}
        <div style={{ 
          background: 'var(--color-surface-glass)', 
          border: '1px solid var(--color-border)', 
          padding: '12px 16px', 
          borderRadius: '8px', 
          fontSize: '0.85rem', 
          color: 'var(--color-primary)',
          opacity: 0.9,
          lineHeight: 1.45,
          textAlign: 'center'
        }}>
          💡 Este es el mismo enlace que recibiste de tu médico por WhatsApp. Confirma tu identidad para continuar.
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            fontSize: '0.85rem',
            lineHeight: 1.4,
            textAlign: 'center',
            fontWeight: 500
          }}>
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Loading overlay for skeleton loading simulation */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 0' }}>
            <div style={{ height: '38px', background: 'var(--color-border)', borderRadius: '6px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
            <div style={{ height: '38px', background: 'var(--color-border)', borderRadius: '6px', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
            <div style={{ height: '42px', background: 'var(--color-border)', borderRadius: '6px', marginTop: '0.5rem', animation: 'pulse 1.5s infinite ease-in-out' }}></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Teléfono */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Número de Teléfono Celular *</label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                disabled={isBlocked}
                placeholder="ej. 5512345678"
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-glass)',
                  fontSize: '0.95rem',
                  outline: 'none',
                  color: 'var(--color-primary)',
                  opacity: isBlocked ? 0.6 : 1
                }}
              />
            </div>

            {/* Fecha de Nacimiento */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Fecha de Nacimiento *</label>
              <input
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                disabled={isBlocked}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-glass)',
                  fontSize: '0.95rem',
                  outline: 'none',
                  color: 'var(--color-primary)',
                  opacity: isBlocked ? 0.6 : 1
                }}
              />
            </div>

            {/* Submit Button */}
            {!isBlocked && (
              <button
                type="submit"
                style={{
                  marginTop: '0.75rem',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-secondary)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  boxShadow: '0 4px 10px rgba(0, 0, 0, 0.05)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                Confirmar Identidad 🔑
              </button>
            )}
          </form>
        )}

        {/* Lockout dynamic timer and QR assist option */}
        {isBlocked && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
            {blockedUntil && (
              <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-primary)', opacity: 0.6 }}>
                Acceso bloqueado temporalmente.
              </div>
            )}
            
            <button
              onClick={() => setShowQr(true)}
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-primary)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem',
                boxShadow: '0 4px 10px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
            >
              Solicitar QR de recepción 📲
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
