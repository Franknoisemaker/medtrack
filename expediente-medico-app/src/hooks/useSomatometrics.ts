import { useState, useCallback } from 'react';
import { calcularIMC, calcularPesoIdeal, calcularDeltaPeso, categorizarIMC, type ImcCategory } from '../utils/imc-engine';

export interface SomatometricsState {
  pesoKg: string;
  tallaCm: string;
  paSistolica: string;
  paDiastolica: string;
  musculoPct: string;
  grasaPct: string;
  cinturaCm: string;
  caderaCm: string;
  bustoCm: string;
  brazoCm: string;
  dosisMl: string;
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
    musculoPct: '',
    grasaPct: '',
    cinturaCm: '',
    caderaCm: '',
    bustoCm: '',
    brazoCm: '',
    dosisMl: '',
  });

  const setValue = useCallback((field: keyof SomatometricsState, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
  }, []);

  const peso = parseFloat(values.pesoKg) || 0;
  const rawTalla = parseFloat(values.tallaCm) || 0;
  // Self-healing: if doctor typed height in meters (e.g., 1.7 instead of 170)
  const talla = rawTalla > 0 && rawTalla < 3 ? rawTalla * 100 : rawTalla;

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
    musculo_pct: parseFloat(values.musculoPct) || null,
    grasa_pct: parseFloat(values.grasaPct) || null,
    cintura_cm: parseFloat(values.cinturaCm) || null,
    cadera_cm: parseFloat(values.caderaCm) || null,
    busto_cm: parseFloat(values.bustoCm) || null,
    brazo_cm: parseFloat(values.brazoCm) || null,
    dosis_ml: parseFloat(values.dosisMl) || null,
  });

  return { values, setValue, computed, toPayload };
}

