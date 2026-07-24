console.log('SUPABASE URL:', import.meta.env.VITE_SUPABASE_URL);

import React, { Component } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import App from '@/App';

class GlobalErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return <div style={{padding: 40, color: 'red', background: '#111', zIndex: 99999, position: 'fixed', inset: 0, overflow: 'auto', fontFamily: 'monospace'}}>
        <h1>🔥 GLOBAL CRASH 🔥</h1>
        <pre style={{whiteSpace: 'pre-wrap', color: '#ff6b6b'}}>{this.state.error?.toString()}</pre>
        <pre style={{whiteSpace: 'pre-wrap', color: '#ff8787'}}>{this.state.error?.stack}</pre>
      </div>;
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ThemeProvider>
        <GlobalErrorBoundary>
          <App />
        </GlobalErrorBoundary>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

