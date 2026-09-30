import React, { useState, useEffect } from 'react';

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIosPrompt, setIsIosPrompt] = useState(false);
  const [showManualInfo, setShowManualInfo] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    const isStandalone = ('standalone' in window.navigator) && (window.navigator.standalone);

    if (isIos && !isStandalone) {
      setIsIosPrompt(true);
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Also listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isInstalled || dismissed) return null;

  const handleInstallClick = async () => {
    if (isIosPrompt) return;

    if (!deferredPrompt) {
      // Browser didn't provide the prompt natively (likely due to cooldown or heuristics).
      // Tell user how to do it manually.
      setShowManualInfo(true);
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#0B1221',
      borderTop: '1px solid #1E2D45',
      padding: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 9999,
      boxShadow: '0 -4px 12px rgba(0,0,0,0.5)',
      flexWrap: 'wrap',
      gap: '12px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 200 }}>
        <img 
          src="/logo.png" 
          alt="Intervention Capital" 
          style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain', background: '#0a1628', padding: 3 }}
        />
        <div>
          <div style={{ color: '#F1F5F9', fontWeight: 600, fontSize: 14 }}>Install Intervention Capital LMS</div>
          <div style={{ color: '#94A3B8', fontSize: 12 }}>
            {isIosPrompt ? 'Tap Share icon, then "Add to Home Screen"' : 
             showManualInfo ? 'Tap your browser menu (⋮) and select "Install app"' : 
             'Add to home screen for faster access'}
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '8px' }}>
        <button 
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94A3B8',
            padding: '8px 12px',
            fontSize: 13,
            cursor: 'pointer',
            borderRadius: 6
          }}
        >
          {isIosPrompt || showManualInfo ? 'Dismiss' : 'Not Now'}
        </button>
        
        {!isIosPrompt && !showManualInfo && (
          <button 
            onClick={handleInstallClick}
            style={{
              background: '#00D4AA',
              border: 'none',
              color: '#060A10',
              fontWeight: 600,
              padding: '8px 16px',
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: 6,
              boxShadow: '0 2px 4px rgba(0, 212, 170, 0.2)'
            }}
          >
            Install App
          </button>
        )}
      </div>
    </div>
  );
}
