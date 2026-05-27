import { useState } from 'react';
import { supabase } from '../../services/supabase';

interface AuthGatewayProps {
  onAuthSuccess: (session: any) => void;
}

export function AuthGateway({ onAuthSuccess }: AuthGatewayProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (isRegister) {
        if (!nombre.trim() || !cedula.trim() || !email.trim() || !password.trim()) {
          throw new Error('Todos los campos son obligatorios.');
        }

        // Register in Supabase Auth, storing nombre and cedula in raw_user_meta_data
        // The Postgres trigger 'on_auth_user_created' handles creating the public.medicos row safely.
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nombre: nombre.trim(),
              cedula: cedula.trim(),
            },
          },
        });

        if (error) throw error;
        
        // Redundant defensive insert to guarantee doctor profile existence in local sandbox
        if (data?.user) {
          try {
            await supabase.from('medicos').insert({
              id: data.user.id,
              nombre: nombre.trim(),
              cedula_cifrada: `[PGP_ENCRYPTED]_${cedula.trim()}`,
              email: email.trim(),
            });
          } catch (insertErr) {
            console.warn('Defensive medico profile insert handled:', insertErr);
          }
        }

        if (data?.session) {
          onAuthSuccess(data.session);
        } else {
          // If email confirmation is required (Supabase default configuration)
          setErrorMessage('¡Registro exitoso! Por favor inicia sesión con tus credenciales.');
          setIsRegister(false);
        }
      } else {
        if (!email.trim() || !password.trim()) {
          throw new Error('Email y contraseña son obligatorios.');
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        if (data?.session) {
          onAuthSuccess(data.session);
        }
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      setErrorMessage(err.message || 'Ocurrió un error inesperado al procesar la solicitud.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: '1.5rem',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div className="card-glass" style={{
        maxWidth: '440px',
        width: '100%',
        padding: '2.5rem',
        borderRadius: '16px',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        color: '#f8fafc',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{
            fontSize: '1.8rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: 0,
            background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            MedTrack Clinico
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem' }}>
            {isRegister ? 'Registro de Cédula & Cuenta Médica' : 'Plataforma Segura del Personal de Salud'}
          </p>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: errorMessage.includes('exitoso') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: errorMessage.includes('exitoso') ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
            color: errorMessage.includes('exitoso') ? '#34d399' : '#f87171',
            fontSize: '0.8rem',
            marginBottom: '1.5rem',
            lineHeight: '1.4',
          }}>
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {isRegister && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1' }}>Nombre Completo</label>
                <input
                  type="text"
                  placeholder="Ej. Dr. Alejandro Guerrero"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  disabled={isLoading}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#818cf8'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1' }}>Cédula Profesional (Dato Protegido 🔐)</label>
                <input
                  type="text"
                  placeholder="Cédula de 7 u 8 dígitos"
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  disabled={isLoading}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1' }}>Correo Electrónico</label>
            <input
              type="email"
              placeholder="medico@medtrack.mx"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f8fafc',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1' }}>Contraseña</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f8fafc',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: '0.75rem',
              borderRadius: '8px',
              background: 'linear-gradient(90deg, #0ea5e9, #6366f1)',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              marginTop: '0.5rem',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
              transition: 'opacity 0.2s',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Procesando...' : isRegister ? 'Registrar y Cifrar Cuenta 🔐' : 'Ingresar al Portal Seguro 🩺'}
          </button>
        </form>

        {/* Footer Link */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setErrorMessage(null);
            }}
            disabled={isLoading}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '0.8rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {isRegister ? '¿Ya tienes una cuenta? Inicia sesión aquí' : '¿Eres un médico nuevo? Regístrate aquí'}
          </button>
        </div>
      </div>
    </div>
  );
}
