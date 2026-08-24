import { describe, it, expect } from 'vitest';
import { generateAccessToken } from './tokenGenerator';

describe('generateAccessToken', () => {
  it('returns a 32-character hex string (16 random bytes)', () => {
    const token = generateAccessToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates a different token on each call', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateAccessToken()));
    expect(tokens.size).toBe(50);
  });
});
