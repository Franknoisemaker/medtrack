import React, { useState } from 'react';
import { supabase } from '../../services/supabase';

interface NewAppointmentModalProps {
  selectedDate: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewAppointmentModal({ selectedDate, onClose, onSuccess }: NewAppointmentModalProps) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [hora, setHora] = useState('10:00');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !telefono.trim()) {
      setErrorMessage('Nombre y teléfono son campos obligatorios.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const sessionToken = session?.access_token || 'mock-doctor-session-token';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';

      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const response = await fetch(`${supabaseUrl}/functions/v1/create-appointment?apikey=${supabaseAnonKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          email: email.trim() || null,
          fecha_hora: new Date(`${selectedDate}T${hora}:00`).toISOString(),
        }),
      });

      const responseData = await response.json();
      if (!response.ok || !responseData.success) {
        throw new Error(responseData.error || 'No se pudo crear la cita clínica.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating appointment:', err);
      setErrorMessage(err.message || 'Error al conectar con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1.5rem',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div className="card-glass" style={{
        maxWidth: '460px',
        width: '100%',
        padding: '2.5rem',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        color: 'var(--color-primary)',
        position: 'relative',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'transparent',
            border: 'none',
            fontSize: '1.25rem',
            cursor: 'pointer',
            color: 'var(--color-primary)',
            opacity: 0.6,
          }}
        >
          ✕
        </button>

        <h3 style={{
          fontSize: '1.35rem',
          fontWeight: 800,
          marginBottom: '0.5rem',
          letterSpacing: '-0.03em',
        }}>
          Agendar Nueva Consulta
        </h3>
        <p style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '1.5rem' }}>
          Fecha seleccionada: <strong>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
        </p>

        {errorMessage && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            fontSize: '0.8rem',
            marginBottom: '1.25rem',
          }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Nombre Completo del Paciente</label>
            <input
              type="text"
              placeholder="Ej. Sofía Medina Juárez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={isLoading}
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-primary)',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Teléfono Celular (10 dígitos)</label>
            <input
              type="tel"
              placeholder="Ej. 5567890123"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              disabled={isLoading}
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-primary)',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Correo Electrónico (Opcional)</label>
            <input
              type="email"
              placeholder="sofia.medina@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-primary)',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Hora de la Cita</label>
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              disabled={isLoading}
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-primary)',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-primary)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '8px',
                background: 'linear-gradient(90deg, #0ea5e9, #6366f1)',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
              }}
            >
              {isLoading ? 'Registrando...' : 'Confirmar Cita 🩺'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
