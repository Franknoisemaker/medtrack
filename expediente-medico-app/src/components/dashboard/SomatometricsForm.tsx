import { useSomatometrics } from '../../hooks/useSomatometrics';
import { IMC_CATEGORIES, imcToSliderPct } from '../../utils/imc-engine';

interface SomatometricsFormProps {
  onDataReady?: (payload: ReturnType<ReturnType<typeof useSomatometrics>['toPayload']>) => void;
  externalHook?: ReturnType<typeof useSomatometrics>;
}

export function SomatometricsForm({ externalHook }: SomatometricsFormProps) {
  const internal = useSomatometrics();
  const { values, setValue, computed } = externalHook ?? internal;

  const { imc, imcRounded, category, pesoIdeal, delta } = computed;
  const catInfo = category ? IMC_CATEGORIES[category] : null;

  const inputStyle = {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface-glass)',
    color: 'var(--color-primary)',
    fontSize: '16px', // prevents Safari auto-zoom
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        📏 Somatometría
      </h3>

      {/* Weight & Height row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)' }}>Peso (kg) *</label>
          <input
            type="number"
            min="1"
            max="300"
            step="0.1"
            value={values.pesoKg}
            onChange={e => setValue('pesoKg', e.target.value)}
            placeholder="ej. 72.5"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)' }}>Talla (cm) *</label>
          <input
            type="number"
            min="50"
            max="250"
            step="0.5"
            value={values.tallaCm}
            onChange={e => setValue('tallaCm', e.target.value)}
            placeholder="ej. 170"
            style={inputStyle}
          />
        </div>
      </div>

      {/* IMC Result Panel */}
      <div style={{
        padding: '1rem',
        borderRadius: '10px',
        background: catInfo ? catInfo.bg : 'rgba(0,0,0,0.02)',
        border: `1px solid ${catInfo ? catInfo.color : 'var(--color-border)'}`,
        transition: 'all 0.3s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-primary)', opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Índice de Masa Corporal
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: catInfo ? catInfo.color : 'var(--color-primary)', lineHeight: 1.1 }}>
              {imcRounded}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            {catInfo && (
              <span style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: catInfo.color,
                background: catInfo.bg,
                padding: '4px 10px',
                borderRadius: '12px',
                border: `1px solid ${catInfo.color}`,
              }}>
                {catInfo.label}
              </span>
            )}
            {delta !== null && (
              <div style={{ fontSize: '0.75rem', marginTop: '6px', color: delta > 0 ? '#dc2626' : '#10b981', fontWeight: 600 }}>
                {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg {delta > 0 ? 'sobre' : 'bajo'} el ideal
              </div>
            )}
          </div>
        </div>

        {/* IMC Slider */}
        <div style={{ position: 'relative', height: '10px', borderRadius: '5px', background: 'linear-gradient(to right, #2563eb 0%, #10b981 40%, #f59e0b 65%, #dc2626 100%)', overflow: 'visible' }}>
          {imc !== null && (
            <div style={{
              position: 'absolute',
              left: `${imcToSliderPct(imc)}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: catInfo ? catInfo.color : '#888',
              border: '3px solid #fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              transition: 'left 0.4s ease',
            }} />
          )}
        </div>

        {/* Scale labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
          {[{ v: 10 }, { v: 18.5 }, { v: 25 }, { v: 30 }, { v: 45 }].map(({ v }) => (
            <span key={v} style={{ fontSize: '0.65rem', color: 'var(--color-primary)', opacity: 0.45 }}>{v}</span>
          ))}
        </div>

        {/* Ideal weight */}
        {pesoIdeal !== null && (
          <div style={{ marginTop: '10px', fontSize: '0.78rem', color: 'var(--color-primary)', opacity: 0.7 }}>
            Peso ideal estimado: <strong>{pesoIdeal.toFixed(1)} kg</strong>
          </div>
        )}
      </div>

      {/* Blood pressure */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)' }}>Presión Arterial (mmHg)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number"
            min="50"
            max="250"
            value={values.paSistolica}
            onChange={e => setValue('paSistolica', e.target.value)}
            placeholder="Sistólica"
            style={{ ...inputStyle }}
          />
          <span style={{ fontWeight: 700, color: 'var(--color-primary)', opacity: 0.4, flexShrink: 0 }}>/</span>
          <input
            type="number"
            min="30"
            max="150"
            value={values.paDiastolica}
            onChange={e => setValue('paDiastolica', e.target.value)}
            placeholder="Diastólica"
            style={{ ...inputStyle }}
          />
          <span style={{ fontSize: '0.78rem', color: 'var(--color-primary)', opacity: 0.5, flexShrink: 0 }}>mmHg</span>
        </div>
        {values.paSistolica && values.paDiastolica && (
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: parseInt(values.paSistolica) >= 140 ? '#dc2626' : '#10b981', marginTop: '2px' }}>
            {parseInt(values.paSistolica) >= 140 ? '⚠️ Presión elevada' : '✓ Presión en rango normal'}
          </div>
        )}
      </div>
    </div>
  );
}
