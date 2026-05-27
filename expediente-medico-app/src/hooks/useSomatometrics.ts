import { useState, useCallback } from 'react';
import { calcularIMC, calcularPesoIdeal, calcularDeltaPeso, categorizarIMC, type ImcCategory } from '../utils/imc-engine';

export interface SomatometricsState {
  pesoKg: string;
  tallaCm: string;
  paSistolica: string;
  paDiastolica: string;
}

export interface SomatometricsComputed {
  imc: number | null;
  imcRounded: string;
  category: ImcCategory | null;
  pesoIdeal: number | null;
  delta: number | null;
}

export function useSomatometrics() {
  const [values, setValues] = useState<SomatometricsState>({
    pesoKg: '',
    tallaCm: '',
    paSistolica: '',
    paDiastolica: '',
  });

  const setValue = useCallback((field: keyof SomatometricsState, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
  }, []);

  const peso = parseFloat(values.pesoKg) || 0;
  const talla = parseFloat(values.tallaCm) || 0;

  const imc = calcularIMC(peso, talla);
  const pesoIdeal = talla > 0 ? calcularPesoIdeal(talla) : null;
  const delta = calcularDeltaPeso(peso, talla);
  const category = imc !== null ? categorizarIMC(imc) : null;
  const imcRounded = imc !== null ? imc.toFixed(1) : '--';

  const computed: SomatometricsComputed = { imc, imcRounded, category, pesoIdeal, delta };

  const toPayload = () => ({
    peso_kg: peso || null,
    talla_cm: talla || null,
    imc: imc,
    pa_sistolica: parseInt(values.paSistolica) || null,
    pa_diastolica: parseInt(values.paDiastolica) || null,
  });

  return { values, setValue, computed, toPayload };
}
