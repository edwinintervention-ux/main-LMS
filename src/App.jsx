/**
 * App.jsx — Root application shell
 *
 * This file is intentionally thin. All actual UI lives in lms-core.jsx
 * (the production-refactored monolith). App.jsx:
 *  1. Reads auth state from AuthContext
 *  2. Shows a full-screen loader while session is resolving
 *  3. Delegates rendering to the LMS core App component
 *
 * The LMS core handles its own routing (admin-login / admin / worker modes)
 * and will automatically integrate Supabase auth when credentials are present.
 */
import React from 'react';
import { useAuth } from '@/context/AuthContext';
import LMSApp from '@/lms-core';
import CustomerPortal from '@/pages/CustomerPortal';
import DocDownloadPage from '@/pages/DocDownloadPage';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';

// Full-screen loading spinner shown while Supabase resolves the session
function AppLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#080C14', flexDirection: 'column', gap: 16,
    }}>
      <div style={{
        width: 40, height: 40, border: '3px solid #1E2D45',
        borderTop: '3px solid #00D4AA', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ color: '#475569', fontSize: 13, fontFamily: 'system-ui' }}>
        Loading…
      </div>
    </div>
  );
}

export default function App() {
  const { loading, error } = useAuth();
  const pathname = window.location.pathname;

  // Handle customer document downloads: /docs/:loanId
  if (pathname.startsWith('/docs')) {
    const parts = pathname.split('/').filter(Boolean);
    const loanId = parts[1] || '';
    return <DocDownloadPage loanId={loanId} />;
  }

  // Handle payment instructions: /pay
  if (pathname.startsWith('/pay')) {
    const PayPage = React.lazy(() => import('@/pages/PayPage'));
    return (
      <React.Suspense fallback={<AppLoader />}>
        <PayPage />
      </React.Suspense>
    );
  }

  // Handle customer portal
  if (pathname.startsWith('/portal')) {
    return <CustomerPortal />;
  }

  if (error && error.includes("Supabase configuration is missing")) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#0D1B2A', flexDirection: 'column', gap: 16,
        padding: 24, textAlign: 'center', color: '#EF4444', fontFamily: 'system-ui'
      }}>
        <h2 style={{ margin: 0, color: '#00D4AA', fontSize: '24px', fontWeight: '800' }}>Configuration Required</h2>
        <p style={{ color: '#94A3B8', maxWidth: 500, margin: 0, lineHeight: 1.6, fontSize: '15px' }}>
          Your Supabase configuration is missing in the hosting environment. Please add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> to your Cloudflare Pages environment variables, then trigger a new deployment.
        </p>
      </div>
    );
  }
  if (loading) return <AppLoader />;
  return (
    <>
      <LMSApp />
      <PwaInstallPrompt />
    </>
  );
}

// Trigger build refresh
