import { describe, it, expect } from 'vitest';
import { selectModel, nextSmallerTier, getModel, estimatedRamGb, BLESSED_MODELS } from '../src/models.js';
import type { HardwareInfo } from '@localbrain/detection';

function hw(freeRamGb: number, gpu = false, vramGb = 0): HardwareInfo {
  return {
    os: 'linux', arch: 'x64', cpuCores: 8, totalRamGb: freeRamGb, freeRamGb,
    freeDiskGb: 100, gpu: { present: gpu, vramGb }, isRoot: false, hasWritePermission: true,
  };
}

describe('selectModel', () => {
  it('picks the sweet-spot 3B for 8–16GB RAM', () => {
    expect(selectModel(hw(12)).spec?.id).toBe('qwen2.5-3b');
  });
  it('picks the tiny model for low RAM', () => {
    expect(selectModel(hw(6)).spec?.id).toBe('smollm2-1.7b');
  });
  it('picks a nano model for very low RAM', () => {
    expect(selectModel(hw(2.5)).spec?.id).toBe('smollm2-360m');
    expect(selectModel(hw(1.2)).spec?.id).toBe('smollm2-135m');
  });
  it('picks 7B for 16GB+ RAM', () => {
    expect(selectModel(hw(32)).spec?.id).toBe('qwen2.5-7b');
  });
  it('picks 7B when a real GPU is present even with modest RAM', () => {
    expect(selectModel(hw(8, true, 8)).spec?.id).toBe('qwen2.5-7b');
  });
  it('needs hosted fallback only when RAM is extremely tiny', () => {
    const c = selectModel(hw(0.5));
    expect(c.spec).toBeNull();
    expect(c.needsHostedFallback).toBe(true);
  });
  it('honors an explicit override', () => {
    expect(selectModel(hw(12), 'smollm2-1.7b').spec?.id).toBe('smollm2-1.7b');
  });
});

describe('helpers', () => {
  it('nextSmallerTier steps down', () => {
    expect(nextSmallerTier(BLESSED_MODELS['qwen2.5-7b']!)?.id).toBe('qwen2.5-3b');
  });
  it('estimatedRamGb uses the ~0.7GB/B rule + headroom', () => {
    expect(estimatedRamGb(BLESSED_MODELS['qwen2.5-3b']!)).toBeCloseTo(3.6, 1);
  });
  it('getModel returns null for unknown ids', () => {
    expect(getModel('does-not-exist')).toBeNull();
  });
});
