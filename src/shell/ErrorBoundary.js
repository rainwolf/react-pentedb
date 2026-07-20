// App-level error boundary. Defense-in-depth against a render/runtime error (a failed
// lazy chunk, an unregistered module factory, an unexpected throw in a panel) degrading
// to a fully blank white page. Instead we render a visible message plus a reload
// affordance, so the user always has feedback and a way forward rather than a silent
// blank screen. This is a safety net, NOT the fix for the import cycle it guards against.
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught an error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          style={{
            padding: '2rem',
            maxWidth: 480,
            margin: '3rem auto',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <h2 style={{ marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>
            The interface failed to load. Reloading usually fixes this.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '0.6rem 1.4rem',
              fontSize: '1rem',
              cursor: 'pointer',
              borderRadius: 6,
              border: '1px solid currentColor',
              background: 'transparent',
              color: 'inherit',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
