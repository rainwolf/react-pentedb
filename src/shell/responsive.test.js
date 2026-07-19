// Unit tests for the pure breakpointForWidth classifier (spec §9):
//   >=1200px  "wide"    three-pane
//   768-1199  "medium"  two-pane + left drawer
//   <768      "narrow"  single column + bottom tabs
import { describe, test, expect } from 'vitest';

import { breakpointForWidth } from './responsive';

describe('breakpointForWidth', () => {
  test('classifies representative widths', () => {
    expect(breakpointForWidth(1400)).toBe('wide');
    expect(breakpointForWidth(900)).toBe('medium');
    expect(breakpointForWidth(390)).toBe('narrow');
  });

  test('is exact at the wide boundary (>=1200)', () => {
    expect(breakpointForWidth(1200)).toBe('wide');
    expect(breakpointForWidth(1199)).toBe('medium');
  });

  test('is exact at the medium boundary (>=768)', () => {
    expect(breakpointForWidth(768)).toBe('medium');
    expect(breakpointForWidth(767)).toBe('narrow');
  });
});
