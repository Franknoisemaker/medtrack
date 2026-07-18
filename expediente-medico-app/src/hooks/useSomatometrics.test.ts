import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSomatometrics } from './useSomatometrics';

describe('useSomatometrics Hook', () => {
  it('should initialize with empty values and null/default computed states', () => {
    const { result } = renderHook(() => useSomatometrics());
    
    expect(result.current.values).toEqual({
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

    expect(result.current.computed).toEqual({
      imc: null,
      imcRounded: '--',
      category: null,
      pesoIdeal: null,
      delta: null,
    });
  });

  it('should update field values correctly using setValue', () => {
    const { result } = renderHook(() => useSomatometrics());

    act(() => {
      result.current.setValue('pesoKg', '70');
      result.current.setValue('tallaCm', '178');
      result.current.setValue('paSistolica', '120');
      result.current.setValue('paDiastolica', '80');
      result.current.setValue('musculoPct', '35.5');
      result.current.setValue('grasaPct', '22.4');
      result.current.setValue('cinturaCm', '80.5');
      result.current.setValue('caderaCm', '95.0');
      result.current.setValue('bustoCm', '90.2');
      result.current.setValue('brazoCm', '32.1');
      result.current.setValue('dosisMl', '1.5');
    });

    expect(result.current.values).toEqual({
      pesoKg: '70',
      tallaCm: '178',
      paSistolica: '120',
      paDiastolica: '80',
      musculoPct: '35.5',
      grasaPct: '22.4',
      cinturaCm: '80.5',
      caderaCm: '95.0',
      bustoCm: '90.2',
      brazoCm: '32.1',
      dosisMl: '1.5',
    });
  });

  it('should compute IMC, WHO category, ideal weight and delta in real time', () => {
    const { result } = renderHook(() => useSomatometrics());

    act(() => {
      result.current.setValue('pesoKg', '70');
      result.current.setValue('tallaCm', '178');
    });

    expect(result.current.computed.imc).not.toBeNull();
    expect(result.current.computed.imcRounded).toBe('22.1');
    expect(result.current.computed.category).toBe('normal');
    expect(result.current.computed.pesoIdeal).toBeCloseTo(69.7, 1); // 1.78² * 22 = 69.71
    expect(result.current.computed.delta).toBeCloseTo(0.3, 1);      // 70 - 69.7 = 0.3
  });

  it('should handle division by zero (height=0) gracefully without crashing', () => {
    const { result } = renderHook(() => useSomatometrics());

    act(() => {
      result.current.setValue('pesoKg', '70');
      result.current.setValue('tallaCm', '0');
    });

    expect(result.current.computed).toEqual({
      imc: null,
      imcRounded: '--',
      category: null,
      pesoIdeal: null,
      delta: null,
    });
  });

  it('should auto-convert height in meters (< 3) to centimeters to avoid database overflow', () => {
    const { result } = renderHook(() => useSomatometrics());

    act(() => {
      result.current.setValue('pesoKg', '70');
      result.current.setValue('tallaCm', '1.7'); // meters
    });

    expect(result.current.toPayload().talla_cm).toBe(170);
    expect(result.current.computed.imcRounded).toBe('24.2');
  });

  it('should return a correctly mapped payload on toPayload call', () => {
    const { result } = renderHook(() => useSomatometrics());

    act(() => {
      result.current.setValue('pesoKg', '85.5');
      result.current.setValue('tallaCm', '180');
      result.current.setValue('paSistolica', '135');
      result.current.setValue('paDiastolica', '85');
      result.current.setValue('musculoPct', '30');
      result.current.setValue('grasaPct', '25.5');
      result.current.setValue('cinturaCm', '92.4');
      result.current.setValue('caderaCm', '104.2');
      result.current.setValue('bustoCm', '101.5');
      result.current.setValue('brazoCm', '36.8');
      result.current.setValue('dosisMl', '1.2');
    });

    const payload = result.current.toPayload();
    expect(payload).toEqual({
      peso_kg: 85.5,
      talla_cm: 180,
      imc: expect.any(Number),
      pa_sistolica: 135,
      pa_diastolica: 85,
      musculo_pct: 30,
      grasa_pct: 25.5,
      cintura_cm: 92.4,
      cadera_cm: 104.2,
      busto_cm: 101.5,
      brazo_cm: 36.8,
      dosis_ml: 1.2,
    });

    expect(payload.imc).toBeCloseTo(26.4, 1); // 85.5 / 1.8² = 26.38
  });
});

