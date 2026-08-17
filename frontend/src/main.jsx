import React from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';

if (typeof window !== 'undefined') {
  window.L = window.L || L;
}

import App from './App';
import './index.css';

// Root Error Boundary Component to prevent black screen on runtime errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Compact Flood Resilience App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', color: '#f87171', background: '#090d16', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2>Application Encountered a Runtime Error</h2>
          <pre style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', color: '#f8fafc', overflow: 'auto' }}>
            {this.state.error?.toString()}
          </pre>
          <button
            style={{ marginTop: '20px', padding: '10px 16px', background: '#38bdf8', color: '#090d16', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
          >
            Clear Local State & Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
