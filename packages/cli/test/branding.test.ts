import { describe, it, expect } from 'vitest';
import { banner, markLine, gradient, MARK } from '../src/branding.js';

const ESC = String.fromCharCode(27); // ANSI escape

// In the test runner stdout is not a TTY, so output is plain (no ANSI).
describe('branding', () => {
  it('banner includes the wordmark and tagline', () => {
    const b = banner();
    expect(b).toContain('l o c a l b r a i n');
    expect(b).toContain('long reach');
  });

  it('markLine includes the octopus mark and name', () => {
    const line = markLine('doctor');
    expect(line).toContain(MARK);
    expect(line).toContain('localbrain');
    expect(line).toContain('doctor');
  });

  it('emits no ANSI escape codes when not a TTY', () => {
    expect(banner().includes(ESC)).toBe(false);
    expect(markLine().includes(ESC)).toBe(false);
    expect(gradient('hello').includes(ESC)).toBe(false);
  });
});
