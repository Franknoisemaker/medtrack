import type { Appointment } from './NewAppointmentForm';
import { supabase } from '../../services/supabase';

interface KanbanBoardProps {
  appointments: Appointment[];
  onSelectPatient: (appointment: Appointment) => void;
  isLoading?: boolean;
}

const statusConfig = {
  PENDING_ONBOARDING: {
    label: 'Pendiente de Registro',
    color: '#64748b',
    bg: '#f1f5f9',
    border: '#cbd5e1',
    badge: { bg: '#e2e8f0', color: '#475569', text: '⏳ Pendiente' },
  },
  ACTIVE: {
    label: 'Activas — Listas para SOAP',
    color: 'var(--color-secondary)',
    bg: 'rgba(37,99,235,0.04)',
    border: 'var(--color-secondary)',
    badge: { bg: 'var(--color-secondary)', color: '#fff', text: '🩺 Expediente Listo' },
  },
  COMPLETED: {
    label: 'Completadas',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.04)',
    border: '#10b981',
    badge: { bg: '#10b981', color: '#fff', text: '✓ Firmada' },
  },
};

function SkeletonCard() {
  return (
    <div style={{
      padding: '1rem',
      borderRadius: '10px',
      background: 'var(--color-surface-glass)',
      border: '1px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      animation: 'pulse 1.8s ease-in-out infinite',
    }}>
      <div style={{ height: '14px', borderRadius: '6px', background: 'var(--color-border)', width: '70%' }} />
      <div style={{ height: '11px', borderRadius: '6px', background: 'var(--color-border)', width: '45%' }} />
      <div style={{ height: '22px', borderRadius: '10px', background: 'var(--color-border)', width: '55%' }} />
    </div>
  );
}

function AppointmentCard({
  appointment,
  onSelect,
}: {
  appointment: Appointment;
  onSelect: () => void;
}) {
  const cfg = statusConfig[appointment.status as keyof typeof statusConfig] ?? statusConfig.PENDING_ONBOARDING;
  const isClickable = appointment.status === 'ACTIVE' || appointment.status === 'COMPLETED';

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const handleResendLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const origin = window.location.origin;
    const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const tokenVal = `mock_jwt_${uuid}`;
    
    const shortCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    let link = `${origin}/onboarding?token=${tokenVal}`;
    if (link.includes('localhost') && link.startsWith('https://')) {
      link = link.replace('https://', 'http://');
    }

    try {
      const { error } = await supabase
        .from('enlaces_cortos')
        .insert({
          code: shortCode,
          long_token: tokenVal,
          expires_at: expiresAt
        });
      if (error) throw error;
      
      let shortUrl = `${origin}/?s=${shortCode}`;
      if (shortUrl.includes('localhost') && shortUrl.startsWith('https://')) {
        shortUrl = shortUrl.replace('https://', 'http://');
      }
      link = shortUrl;
    } catch (err) {
      console.error('Failed to create short link for resend, using fallback long URL:', err);
    }

    const message = `🏥 *Expediente Clínico Digital — MedTrack*\n\nHola *${appointment.nombre}*,\n\nTe recordamos completar tus antecedentes médicos de forma digital y segura en el siguiente enlace antes de tu consulta:\n\n🔗 *Enlace de acceso seguro:*\n${link}\n\n_Por tu seguridad, este enlace es de uso único y vencerá en 24 horas. Si tienes dudas, puedes responder a este chat._`;

    navigator.clipboard.writeText(message);
    alert('✅ Mensaje de WhatsApp copiado al portapapeles. ¡Ya puedes pegarlo y enviarlo al paciente!');
  };

  return (
    <div
      onClick={isClickable ? onSelect : undefined}
      style={{
        padding: '1rem',
        borderRadius: '10px',
        background: 'var(--color-surface-glass)',
        border: `1px solid ${cfg.border}`,
        borderLeft: `4px solid ${cfg.color}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s ease, transform 0.15s ease',
        animation: 'slideUp 0.3s ease',
      }}
      onMouseEnter={e => {
        if (isClickable) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.07)';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLDivElement).style.transform = 'none';
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-primary)' }}>
        {appointment.nombre}
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--color-primary)', opacity: 0.65 }}>
        📞 {appointment.telefono}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', opacity: 0.55 }}>
        🗓 {formatDateTime(appointment.fecha_hora)}
      </div>

      {/* Badge */}
      <span style={{
        display: 'inline-block',
        fontSize: '0.72rem',
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: '12px',
        background: cfg.badge.bg,
        color: cfg.badge.color,
        width: 'fit-content',
      }}>
        {cfg.badge.text}
      </span>

      {/* Resend link button for pending patients */}
      {appointment.status === 'PENDING_ONBOARDING' && (
        <button
          onClick={handleResendLink}
          style={{
            marginTop: '2px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-primary)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          🔗 Reenviar enlace
        </button>
      )}

      {/* Open record hint for active */}
      {isClickable && (
        <div style={{ fontSize: '0.72rem', color: cfg.color, opacity: 0.8, fontWeight: 600 }}>
          Abrir expediente →
        </div>
      )}
    </div>
  );
}

export function KanbanBoard({ appointments, onSelectPatient, isLoading = false }: KanbanBoardProps) {
  const statuses: Array<'PENDING_ONBOARDING' | 'ACTIVE' | 'COMPLETED'> = ['PENDING_ONBOARDING', 'ACTIVE', 'COMPLETED'];

  return (
    <div>
      <h2 style={{
        fontSize: '1.2rem',
        fontWeight: 700,
        color: 'var(--color-primary)',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        📊 Pacientes del Día
        <span style={{ fontSize: '0.8rem', fontWeight: 500, opacity: 0.5 }}>
          — {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long' })}
        </span>
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>
        {statuses.map((status) => {
          const cfg = statusConfig[status];
          const cards = appointments
            .filter(a => a.status === status)
            .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime());

          return (
            <div key={status} style={{
              background: 'rgba(0,0,0,0.015)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              padding: '1rem',
              minHeight: '300px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}>
              {/* Column Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: cfg.color }}>
                  {cfg.label}
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: status === 'ACTIVE' ? 'var(--color-secondary)' : status === 'COMPLETED' ? '#10b981' : '#e2e8f0',
                  color: status === 'PENDING_ONBOARDING' ? '#475569' : '#fff',
                  padding: '2px 8px',
                  borderRadius: '10px',
                }}>
                  {isLoading ? '…' : cards.length}
                </span>
              </div>

              {/* Cards or Skeletons */}
              {isLoading ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : cards.length === 0 ? (
                <div style={{
                  flexGrow: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  color: 'var(--color-primary)',
                  opacity: 0.4,
                  border: '1px dashed var(--color-border)',
                  borderRadius: '8px',
                  padding: '2rem',
                  textAlign: 'center',
                }}>
                  Sin pacientes
                </div>
              ) : (
                cards.map(app => (
                  <AppointmentCard
                    key={app.id}
                    appointment={app}
                    onSelect={() => onSelectPatient(app)}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
