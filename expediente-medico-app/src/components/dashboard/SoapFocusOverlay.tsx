interface SoapFocusOverlayProps {
  field: 'subjetivo' | 'objetivo' | 'analisis' | 'plan';
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  subjetivo: 'S — Subjetivo',
  objetivo:  'O — Objetivo',
  analisis:  'A — Análisis / Diagnóstico',
  plan:      'P — Plan de Tratamiento',
};

export function SoapFocusOverlay({ field, value, onChange, onClose }: SoapFocusOverlayProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'all',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Top panel (52% of screen) — stays above virtual keyboard */}
      <div style={{
        height: '52%',
        background: 'var(--color-bg)',
        borderBottom: '2px solid var(--color-secondary)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem',
        gap: '1rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Modo Enfoque iPad
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
              {FIELD_LABELS[field]}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'var(--color-border)',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--color-primary)',
              cursor: 'pointer',
            }}
          >
            ✕ Cerrar
          </button>
        </div>

        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Escribe aquí el campo ${FIELD_LABELS[field]}...`}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '10px',
            border: '2px solid var(--color-secondary)',
            background: 'var(--color-surface-glass)',
            color: 'var(--color-primary)',
            fontSize: '16px',  // prevents Safari auto-zoom
            lineHeight: 1.6,
            resize: 'none',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </div>

      {/* Transparent bottom half (keyboard area) */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
    </div>
  );
}
