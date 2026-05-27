import React from 'react';

interface DataPoint {
  fecha: string;
  peso?: number | null;
  imc?: number | null;
  pa_sistolica?: number | null;
  pa_diastolica?: number | null;
}

interface EvolutionChartsProps {
  data: DataPoint[];
}

interface ChartConfig {
  key: 'peso' | 'imc' | 'pa_sistolica';
  label: string;
  unit: string;
  color: string;
  secondaryKey?: 'pa_diastolica';
  secondaryColor?: string;
}

const CHARTS: ChartConfig[] = [
  { key: 'peso',        label: 'Evolución de Peso',            unit: 'kg',    color: '#2563eb' },
  { key: 'imc',         label: 'Evolución del IMC',            unit: '',      color: '#10b981' },
  { key: 'pa_sistolica',label: 'Presión Arterial',            unit: 'mmHg',  color: '#dc2626', secondaryKey: 'pa_diastolica', secondaryColor: '#f97316' },
];

const SVG_W = 400;
const SVG_H = 140;
const PAD = { top: 16, right: 16, bottom: 32, left: 44 };
const PLOT_W = SVG_W - PAD.left - PAD.right;
const PLOT_H = SVG_H - PAD.top - PAD.bottom;

function lerp(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function buildPath(xs: number[], ys: number[]): string {
  if (xs.length === 0) return '';
  return xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
}

interface SingleChartProps {
  cfg: ChartConfig;
  data: DataPoint[];
}

interface TooltipState {
  x: number;
  y: number;
  label: string;
  primary: string;
  secondary?: string;
}

function SingleChart({ cfg, data }: SingleChartProps) {
  const [tooltip, setTooltip] = React.useState<TooltipState | null>(null);

  const valid = data.filter(d => d[cfg.key] != null);

  if (valid.length < 2) {
    return (
      <div style={{
        padding: '1.25rem',
        borderRadius: '10px',
        background: 'rgba(0,0,0,0.02)',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-primary)', marginBottom: '8px' }}>{cfg.label}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-primary)', opacity: 0.45, textAlign: 'center', padding: '1rem 0' }}>
          📊 Se necesitan 2 o más visitas para mostrar la evolución.
        </div>
      </div>
    );
  }

  const primaryValues = valid.map(d => d[cfg.key] as number);
  const secondaryValues = cfg.secondaryKey ? valid.map(d => (d[cfg.secondaryKey!] ?? null) as number | null).filter(Boolean) as number[] : [];
  const allValues = [...primaryValues, ...secondaryValues];

  const yMin = Math.min(...allValues) * 0.95;
  const yMax = Math.max(...allValues) * 1.05;

  const xs = valid.map((_, i) => PAD.left + lerp(i, 0, valid.length - 1, 0, PLOT_W));
  const ys = primaryValues.map(v => PAD.top + lerp(v, yMax, yMin, 0, PLOT_H));
  const ys2 = cfg.secondaryKey ? valid.map(d => {
    const v = d[cfg.secondaryKey!] as number | null;
    return v != null ? PAD.top + lerp(v, yMax, yMin, 0, PLOT_H) : null;
  }) : [];

  const yTicks = [yMin, (yMin + yMax) / 2, yMax].map(v => ({
    v,
    y: PAD.top + lerp(v, yMax, yMin, 0, PLOT_H),
  }));

  return (
    <div style={{
      padding: '1rem',
      borderRadius: '10px',
      background: 'var(--color-surface-glass)',
      border: '1px solid var(--color-border)',
      position: 'relative',
    }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-primary)', marginBottom: '8px' }}>
        {cfg.label}
      </div>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      >
        {/* Grid lines */}
        {yTicks.map(({ v, y }) => (
          <g key={v}>
            <line x1={PAD.left} y1={y} x2={SVG_W - PAD.right} y2={y} stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="4,4" />
            <text x={PAD.left - 4} y={y} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="currentColor" style={{ opacity: 0.45 }}>
              {v.toFixed(0)}{cfg.unit}
            </text>
          </g>
        ))}

        {/* Primary line */}
        <path d={buildPath(xs, ys)} fill="none" stroke={cfg.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Secondary line (diastolic) */}
        {cfg.secondaryKey && (
          <path
            d={buildPath(xs.filter((_, i) => ys2[i] != null), (ys2.filter(Boolean) as number[]))}
            fill="none"
            stroke={cfg.secondaryColor}
            strokeWidth="2"
            strokeDasharray="5,3"
            strokeLinecap="round"
          />
        )}

        {/* Data points with touch targets ≥44×44px */}
        {valid.map((d, i) => {
          const px = xs[i];
          const py = ys[i];
          const dateLabel = new Date(d.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
          return (
            <g key={i}>
              {/* Invisible touch target 44×44px for iPad */}
              <rect
                x={px - 22} y={py - 22} width={44} height={44}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setTooltip({
                  x: px, y: py,
                  label: dateLabel,
                  primary: `${(d[cfg.key] as number).toFixed(1)} ${cfg.unit}`,
                  secondary: cfg.secondaryKey && d[cfg.secondaryKey] != null
                    ? `Diastólica: ${d[cfg.secondaryKey]} mmHg`
                    : undefined,
                })}
                onMouseLeave={() => setTooltip(null)}
              />
              <circle cx={px} cy={py} r={4} fill={cfg.color} stroke="#fff" strokeWidth={2} />
              {/* X-axis date label */}
              <text x={px} y={SVG_H - 6} textAnchor="middle" fontSize="8" fill="currentColor" style={{ opacity: 0.5 }}>
                {dateLabel}
              </text>
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={Math.min(tooltip.x - 6, SVG_W - 130)}
              y={tooltip.y - 46}
              width={120}
              height={tooltip.secondary ? 48 : 34}
              rx={6}
              fill="rgba(30,30,40,0.85)"
              style={{ backdropFilter: 'blur(8px)' }}
            />
            <text x={Math.min(tooltip.x - 6, SVG_W - 130) + 8} y={tooltip.y - 30} fontSize="9" fill="#fff" fontWeight="bold">
              {tooltip.label}
            </text>
            <text x={Math.min(tooltip.x - 6, SVG_W - 130) + 8} y={tooltip.y - 18} fontSize="10" fill={cfg.color} fontWeight="bold">
              {tooltip.primary}
            </text>
            {tooltip.secondary && (
              <text x={Math.min(tooltip.x - 6, SVG_W - 130) + 8} y={tooltip.y - 6} fontSize="9" fill={cfg.secondaryColor ?? '#fff'}>
                {tooltip.secondary}
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

class ChartErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(220,38,38,0.06)', border: '1px solid #dc2626', fontSize: '0.8rem', color: '#dc2626' }}>
          ⚠️ Error al renderizar la gráfica. Los datos no se perdieron.
        </div>
      );
    }
    return this.props.children;
  }
}

export function EvolutionCharts({ data }: EvolutionChartsProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', opacity: 0.45, fontSize: '0.85rem' }}>
        📊 Sin datos de consultas anteriores.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
        📈 Evolución Histórica
      </h3>
      {CHARTS.map(cfg => (
        <ChartErrorBoundary key={cfg.key}>
          <SingleChart cfg={cfg} data={data} />
        </ChartErrorBoundary>
      ))}
    </div>
  );
}
