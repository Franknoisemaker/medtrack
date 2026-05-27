import { describe, it, expect } from 'vitest';
import { calcularIMC, calcularPesoIdeal, calcularDeltaPeso, categorizarIMC, imcToSliderPct } from '../utils/imc-engine';

describe('IMC Engine', () => {
  it('returns null when talla is 0 (no division by zero)', () => {
    expect(calcularIMC(70, 0)).toBeNull();
  });

  it('returns null when peso is 0', () => {
    expect(calcularIMC(0, 178)).toBeNull();
  });

  it('calculates correct IMC for 70kg / 178cm', () => {
    const result = calcularIMC(70, 178);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(22.09, 1);
  });

  it('categorizes IMC below 18.5 as bajo_peso', () => {
    expect(categorizarIMC(17.0)).toBe('bajo_peso');
  });

  it('categorizes IMC 18.5–24.9 as normal', () => {
    expect(categorizarIMC(22.09)).toBe('normal');
  });

  it('categorizes IMC 25–29.9 as sobrepeso', () => {
    expect(categorizarIMC(27.0)).toBe('sobrepeso');
  });

  it('categorizes IMC >= 30 as obesidad', () => {
    expect(categorizarIMC(32.0)).toBe('obesidad');
  });

  it('calculates ideal weight correctly for 170cm', () => {
    const ideal = calcularPesoIdeal(170);
    expect(ideal).toBeCloseTo(63.58, 1); // 1.70² × 22 = 63.58
  });

  it('returns 0 ideal weight when talla is 0', () => {
    expect(calcularPesoIdeal(0)).toBe(0);
  });

  it('calculates positive delta when patient is above ideal weight', () => {
    const delta = calcularDeltaPeso(80, 170); // ideal=63.58, delta=+16.42
    expect(delta).not.toBeNull();
    expect(delta!).toBeGreaterThan(0);
  });

  it('calculates negative delta when patient is below ideal weight', () => {
    const delta = calcularDeltaPeso(55, 170); // ideal=63.58, delta=-8.58
    expect(delta).not.toBeNull();
    expect(delta!).toBeLessThan(0);
  });

  it('maps IMC 22 to slider ~34% position', () => {
    const pct = imcToSliderPct(22);
    expect(pct).toBeGreaterThan(30);
    expect(pct).toBeLessThan(40);
  });

  it('clamps slider at 0% for very low IMC', () => {
    expect(imcToSliderPct(5)).toBe(0);
  });

  it('clamps slider at 100% for very high IMC', () => {
    expect(imcToSliderPct(60)).toBe(100);
  });
});
