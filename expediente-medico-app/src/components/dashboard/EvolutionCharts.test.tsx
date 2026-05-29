import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EvolutionCharts } from './EvolutionCharts';

// Mock data containing multiple visits for complete trend lines
const mockHistoricalData = [
  { fecha: '2026-05-01T10:00:00.000Z', peso: 70, imc: 22.1, pa_sistolica: 120, pa_diastolica: 80 },
  { fecha: '2026-05-10T10:00:00.000Z', peso: 72, imc: 22.7, pa_sistolica: 125, pa_diastolica: 82 },
  { fecha: '2026-05-20T10:00:00.000Z', peso: 71, imc: 22.4, pa_sistolica: 122, pa_diastolica: 81 },
];

describe('EvolutionCharts Component', () => {
  it('renders "Sin datos de consultas anteriores" message when history is empty', () => {
    render(<EvolutionCharts data={[]} />);
    expect(screen.getByText(/📊 Sin datos de consultas anteriores/i)).toBeInTheDocument();
  });

  it('renders single data point successfully when history has only 1 point', () => {
    const singleDataPoint = [
      { fecha: '2026-05-20T10:00:00.000Z', peso: 71, imc: 22.4, pa_sistolica: 122, pa_diastolica: 81 }
    ];
    render(<EvolutionCharts data={singleDataPoint} />);
    
    // Renders the section title
    expect(screen.getByText(/📈 Evolución Histórica/i)).toBeInTheDocument();
    
    // Renders the badges with captured values in headers
    expect(screen.getByText('71.0 kg')).toBeInTheDocument();
    expect(screen.getByText('22.4')).toBeInTheDocument();
    expect(screen.getByText('122/81 mmHg')).toBeInTheDocument();
  });

  it('renders SVG canvas, gridlines and labels when historical data has multiple visits', () => {
    const { container } = render(<EvolutionCharts data={mockHistoricalData} />);

    // Verify SVGs are rendered using tag query
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(3);

    // Verify date labels are rendered (Mexican Spanish or generic node local month formats)
    expect(screen.getAllByText(/may/i).length).toBeGreaterThan(0);
  });

  it('displays tooltip on hover over invisible 44x44px touch targets', () => {
    const { container } = render(<EvolutionCharts data={mockHistoricalData} />);

    // The touch targets are invisible rectangles (rect)
    const touchTargets = container.querySelectorAll('rect');
    expect(touchTargets.length).toBeGreaterThanOrEqual(9); // 3 points per chart * 3 charts

    const firstPointTarget = touchTargets[0];
    
    // Trigger mouse enter
    fireEvent.mouseEnter(firstPointTarget);

    // Expect tooltip content (unique weight metric) to appear in the DOM
    expect(screen.getByText('70.0 kg')).toBeInTheDocument();
  });

  it('handles rendering exceptions gracefully within ChartErrorBoundary without crashing the app', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Passing [null] will force a TypeError inside SingleChart because d is null
    const badData = [null as any];

    render(<EvolutionCharts data={badData} />);

    // Renders custom fallback message in affected chart component instead of crashing
    expect(screen.getAllByText(/⚠️ Error al renderizar la gráfica. Los datos no se perdieron./i).length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });
});
