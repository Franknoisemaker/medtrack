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
    });

    expect(result.current.values).toEqual({
      pesoKg: '70',
      tallaCm: '178',
      paSistolica: '120',
      paDiastolica: '80',
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

  it('should return a correctly mapped payload on toPayload call', () => {
    const { result } = renderHook(() => useSomatometrics());

    act(() => {
      result.current.setValue('pesoKg', '85.5');
      result.current.setValue('tallaCm', '180');
      result.current.setValue('paSistolica', '135');
      result.current.setValue('paDiastolica', '85');
    });

    const payload = result.current.toPayload();
    expect(payload).toEqual({
      peso_kg: 85.5,
      talla_cm: 180,
      imc: expect.any(Number),
      pa_sistolica: 135,
      pa_diastolica: 85,
    });

    expect(payload.imc).toBeCloseTo(26.4, 1); // 85.5 / 1.8² = 26.38
  });
});
