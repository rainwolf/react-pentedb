// Breakpoint hook for the workbench layout (spec §9):
//   >=1200px  "wide"    three-pane
//   768-1199  "medium"  two-pane + left drawer
//   <768      "narrow"  single column + bottom tabs
//
// Deliberately built on window.innerWidth + a resize listener rather than
// window.matchMedia: jsdom (our unit-test environment) does not implement
// matchMedia without an extra polyfill, whereas innerWidth/resize are plain
// DOM globals a test can drive directly (`window.innerWidth = 390;
// window.dispatchEvent(new Event('resize'))`).
import { useEffect, useState } from 'react';

export const BREAKPOINTS = { medium: 768, wide: 1200 };

export function breakpointForWidth(width) {
  if (width >= BREAKPOINTS.wide) return 'wide';
  if (width >= BREAKPOINTS.medium) return 'medium';
  return 'narrow';
}

export function useBreakpoint() {
  const [bp, setBp] = useState(() =>
    breakpointForWidth(typeof window !== 'undefined' ? window.innerWidth : BREAKPOINTS.wide)
  );

  useEffect(() => {
    const onResize = () => setBp(breakpointForWidth(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return bp;
}
