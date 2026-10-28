import { describe, it, expect } from 'vitest';
import { computeBasename } from './basename';
import { canonicalUrl } from './gameTab';

describe('computeBasename', () => {
  it('prod prefix has no trailing slash', () => {
    expect(computeBasename('/gameServer/db')).toBe('/gameServer/db');
    expect(computeBasename('/gameServer/db/')).toBe('/gameServer/db');
  });
  it('dev/default prefix gives empty basename', () => {
    expect(computeBasename('/')).toBe('');
    expect(computeBasename('')).toBe('');
    expect(computeBasename(undefined)).toBe('');
  });
  it('ignores absolute-URL / auto prefixes', () => {
    expect(computeBasename('https://cdn.example/x')).toBe('');
    expect(computeBasename('auto')).toBe('');
  });
});

describe('canonicalUrl is basename-relative (router adds the prefix once)', () => {
  it('never embeds the prefix', () => {
    const u = canonicalUrl({ kind: 'game', gid: 5 }, {});
    expect(u).toBe('/g/5');
    expect(u).not.toContain('gameServer');
  });
});
