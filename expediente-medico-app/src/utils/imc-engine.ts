// IMC Engine — pure functions, no side effects (fully testeable in Vitest)

export type ImcCategory = 'bajo_peso' | 'normal' | 'sobrepeso' | 'obesidad';

/**
 * Calculate BMI. Returns null if height or weight is 0 to avoid division by zero.
 */
export function calcularIMC(pesoKg: number, tallaCm: number): number | null {
  if (tallaCm <= 0 || pesoKg <= 0) return null;
  const tallaM = tallaCm / 100;
  return pesoKg / (tallaM * tallaM);
}

/**
 * Ideal weight using the Broca/simple method: m² × 22 (mid-normal BMI).
 */
export function calcularPesoIdeal(tallaCm: number): number {
  if (tallaCm <= 0) return 0;
  const tallaM = tallaCm / 100;
  return tallaM * tallaM * 22;
}

/**
 * Delta from ideal weight in kg. Positive = above ideal, negative = below.
 */
export function calcularDeltaPeso(pesoKg: number, tallaCm: number): number | null {
  if (tallaCm <= 0 || pesoKg <= 0) return null;
  return pesoKg - calcularPesoIdeal(tallaCm);
}

/**
 * Categorize BMI according to WHO thresholds.
 */
export function categorizarIMC(imc: number): ImcCategory {
  if (imc < 18.5) return 'bajo_peso';
  if (imc < 25) return 'normal';
  if (imc < 30) return 'sobrepeso';
  return 'obesidad';
}

export const IMC_CATEGORIES: Record<ImcCategory, {
  label: string;
  color: string;
  bg: string;
  min: number;
  max: number;
}> = {
  bajo_peso: { label: 'Bajo peso', color: '#2563eb', bg: 'rgba(37,99,235,0.12)', min: 10, max: 18.5 },
  normal:    { label: 'Normal',    color: '#10b981', bg: 'rgba(16,185,129,0.12)', min: 18.5, max: 25 },
  sobrepeso: { label: 'Sobrepeso', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', min: 25, max: 30 },
  obesidad:  { label: 'Obesidad',  color: '#dc2626', bg: 'rgba(220,38,38,0.12)',  min: 30, max: 45 },
};

/**
 * Map an IMC value to a 0–100 slider position within the 10–45 display range.
 */
export function imcToSliderPct(imc: number): number {
  const MIN = 10;
  const MAX = 45;
  return Math.max(0, Math.min(100, ((imc - MIN) / (MAX - MIN)) * 100));
}
