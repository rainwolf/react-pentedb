import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// Trivial smoke test: exercises the full toolchain (rsbuild's oxc JSX transform via
// vitest, jsdom, @testing-library/react, and MUI's ThemeProvider/CssBaseline) end to end.
describe('App', () => {
  it('renders "pentedb"', () => {
    render(<App />);
    expect(screen.getByText('pentedb')).toBeTruthy();
  });
});
