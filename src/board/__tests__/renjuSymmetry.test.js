// Regression test for shape-relative (placed-stone) symmetry dedup of Branch-B 5th-move offers.
// See /scratchpad/renju_symmetry_spec.md — single source of truth.
// The OLD centre-based code computes symmetry about the fixed centre (7,7) and yields
// stabilizer {identity} for the regression position, so it wrongly accepts mirror pairs.

import {describe, it, expect} from 'vitest';
import {renjuStabilizer, isOfferDup, renjuApply} from '../renjuSymmetry';

const SIZE = 15;
const idx = (x, y) => x + y * SIZE;

const BLACK = 1;
const WHITE = 2;

// Regression position: m1..m4 = B,W,B,W (spec §"Regression position").
// BLACK = {(7,7),(6,7)}, WHITE = {(7,6),(6,8)}.
function regressionValueAt() {
  const board = {};
  board[idx(7, 7)] = BLACK;
  board[idx(6, 7)] = BLACK;
  board[idx(7, 6)] = WHITE;
  board[idx(6, 8)] = WHITE;
  return (m) => board[m] || 0;
}

// Asymmetric control: replace m4 (6,8) WHITE with (5,8) WHITE.
function asymmetricValueAt() {
  const board = {};
  board[idx(7, 7)] = BLACK;
  board[idx(6, 7)] = BLACK;
  board[idx(7, 6)] = WHITE;
  board[idx(5, 8)] = WHITE;
  return (m) => board[m] || 0;
}

// Normalise stabilizer to a comparable Set of "r,tx,ty" strings.
function stabKeys(stab) {
  return new Set(stab.map((t) => `${t[0]},${t[1]},${t[2]}`));
}

describe('renju shape-relative symmetry — regression position', () => {
  it('stabilizer is exactly { (0,0,0), (4,13,14) }', () => {
    const stab = renjuStabilizer(regressionValueAt());
    expect(stabKeys(stab)).toEqual(new Set(['0,0,0', '4,13,14']));
  });

  // §"Required test assertions" #1 — dedup now fires.
  const mirrorPairs = [
    [idx(8, 4), idx(5, 10)], // 68 <-> 155
    [idx(6, 5), idx(7, 9)],  // 81 <-> 142
    [idx(5, 6), idx(8, 8)],  // 95 <-> 128
    [idx(9, 9), idx(4, 5)],  // 144 <-> 79
  ];

  it.each(mirrorPairs)('mirror pair %i <-> %i: second offer is a symmetric duplicate', (a, b) => {
    const stab = renjuStabilizer(regressionValueAt());
    // a is offered, b must be detected as a duplicate of a.
    expect(isOfferDup(b, [a], stab, SIZE)).toBe(true);
    // and symmetrically.
    expect(isOfferDup(a, [b], stab, SIZE)).toBe(true);
  });

  // §"Required test assertions" #3 — bounds guard, no row wraparound.
  it('bounds guard: (14,14) whose 180 image is off-board is not a false dup', () => {
    const stab = renjuStabilizer(regressionValueAt());
    // image of (14,14) under (4,13,14) -> (-1,0) -> sentinel.
    expect(renjuApply(idx(14, 14), [4, 13, 14], SIZE)).toBe(-1);
    // unrelated prior offer, then (14,14): both accepted.
    const unrelated = idx(1, 1); // image (12,13) — not (14,14)
    expect(isOfferDup(idx(14, 14), [unrelated], stab, SIZE)).toBe(false);
    expect(isOfferDup(unrelated, [idx(14, 14)], stab, SIZE)).toBe(false);
  });

  // FIX 1 — true row-wraparound case that makes the PER-AXIS X/Y guard load-bearing.
  // Offer (14,13)=209, candidate (14,0)=14. Under (4,13,14): lin_r4(14,0)=(-14,0); +(13,14)=(-1,14).
  // X=-1 is off-board, so the per-axis guard returns the sentinel -1 -> (14,0) is ACCEPTED.
  // WITHOUT the per-axis guard the naive flat index would be (-1)+(14*15)=209 == the prior offer,
  // falsely rejecting (14,0). Unlike the (14,14) case (naive index -1, caught by `dst<0`), removing
  // the `0<=X<N && 0<=Y<N` guard makes THIS assertion fail.
  it('bounds guard is load-bearing: (14,0) after (14,13) does not wrap onto the offered cell', () => {
    const stab = renjuStabilizer(regressionValueAt());
    expect(idx(14, 13)).toBe(209);
    expect(idx(14, 0)).toBe(14);
    // per-axis guard maps (14,0) off-board under the non-identity op -> sentinel, not 209.
    expect(renjuApply(idx(14, 0), [4, 13, 14], SIZE)).toBe(-1);
    // offering 209 then 14 -> 14 is NOT a symmetric duplicate (would be 209 via naive wraparound).
    expect(isOfferDup(idx(14, 0), [idx(14, 13)], stab, SIZE)).toBe(false);
    // sanity: array and Set callers agree (FIX 4).
    expect(isOfferDup(idx(14, 0), new Set([idx(14, 13)]), stab, SIZE)).toBe(false);
  });

  // §"Required test assertions" #4 — valid full 10-offer set, all accepted.
  it('a 10-offer set with no two related by a stabilizer transform is fully accepted', () => {
    const stab = renjuStabilizer(regressionValueAt());
    // points (0..9, 0): images are at row y=14, disjoint from the offered row y=0.
    const candidates = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => idx(x, 0));
    const offered = [];
    for (const c of candidates) {
      expect(isOfferDup(c, offered, stab, SIZE)).toBe(false);
      offered.push(c);
    }
    expect(offered.length).toBe(10);
  });
});

describe('renju shape-relative symmetry — asymmetric control (no over-collapse)', () => {
  // §"Required test assertions" #2.
  it('stabilizer is identity only', () => {
    const stab = renjuStabilizer(asymmetricValueAt());
    expect(stabKeys(stab)).toEqual(new Set(['0,0,0']));
  });

  it('offering (8,4) then (5,10): BOTH accepted (not a duplicate)', () => {
    const stab = renjuStabilizer(asymmetricValueAt());
    const first = idx(8, 4);
    const second = idx(5, 10);
    expect(isOfferDup(first, [], stab, SIZE)).toBe(false);
    expect(isOfferDup(second, [first], stab, SIZE)).toBe(false);
  });

  it('exact repeat is still rejected', () => {
    const stab = renjuStabilizer(asymmetricValueAt());
    const p = idx(8, 4);
    expect(isOfferDup(p, [p], stab, SIZE)).toBe(true);
  });
});
