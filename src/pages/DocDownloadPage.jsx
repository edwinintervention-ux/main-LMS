import React, { useState, useEffect } from 'react';
import { supabase } from '@/config/supabaseClient';
import { FileText, Download, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react';

export default function DocDownloadPage({ loanId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [agreementUrl, setAgreementUrl] = useState(null);
  const [assetUrl, setAssetUrl] = useState(null);
  const [downloading, setDownloading] = useState({ agreement: false, asset: false });

  useEffect(() => {
    async function loadDocs() {
      if (!loanId) {
        setError('No loan reference provided.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // List files in the loan folder inside 'signed-docs'
        const { data: files, error: listErr } = await supabase.storage
          .from('signed-docs')
          .list(loanId);

        if (listErr) {
          throw new Error('Could not access document vault: ' + listErr.message);
        }

        if (!files || files.length === 0) {
          setError(`No signed documents were found for reference ${loanId}. Please contact your loan officer.`);
          setLoading(false);
          return;
        }

        // Find agreement and asset list
        const agreeFile = files.find(f => f.name.toLowerCase().includes('agreement'));
        const assetFile = files.find(f => f.name.toLowerCase().includes('asset'));

        // Generate signed download URLs (valid 24h)
        if (agreeFile) {
          const { data: aData } = await supabase.storage
            .from('signed-docs')
            .createSignedUrl(`${loanId}/${agreeFile.name}`, 86400, {
              download: agreeFile.name,
            });
          if (aData?.signedUrl) setAgreementUrl(aData.signedUrl);
        }

        if (assetFile) {
          const { data: asData } = await supabase.storage
            .from('signed-docs')
            .createSignedUrl(`${loanId}/${assetFile.name}`, 86400, {
              download: assetFile.name,
            });
          if (asData?.signedUrl) setAssetUrl(asData.signedUrl);
        }

        setLoading(false);
      } catch (err) {
        console.error('[DocDownloadPage]', err);
        setError(err.message || 'Failed to load documents');
        setLoading(false);
      }
    }

    loadDocs();
  }, [loanId]);

  const handleDownload = (type, url, filename) => {
    if (!url) return;
    setDownloading(prev => ({ ...prev, [type]: true }));
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloading(prev => ({ ...prev, [type]: false }));
    }, 2000);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #0c192c 0%, #050811 100%)',
      color: '#F8FAFC',
      fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow orbs */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '20%',
        width: 450,
        height: 450,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 229, 153, 0.12) 0%, transparent 70%)',
        filter: 'blur(50px)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        right: '15%',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
        filter: 'blur(50px)',
        pointerEvents: 'none',
      }} />

      {/* Main card */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        background: 'rgba(13, 19, 33, 0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 24,
        padding: '32px 24px',
        boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.7), 0 0 40px -10px rgba(0, 229, 153, 0.25)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(0, 229, 153, 0.08)',
            border: '1px solid rgba(0, 229, 153, 0.25)',
            padding: '6px 14px',
            borderRadius: 99,
            fontSize: 12,
            fontWeight: 700,
            color: '#00E599',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            <ShieldCheck size={14} />
            Verified Documents
          </div>
          <h1 style={{
            fontSize: 22,
            fontWeight: 800,
            color: '#FFFFFF',
            margin: '0 0 6px',
            letterSpacing: '-0.3px',
          }}>
            Adequate Capital
          </h1>
          <p style={{
            fontSize: 13,
            color: '#94A3B8',
            margin: 0,
          }}>
            Signed documents for loan <span style={{ color: '#00E599', fontWeight: 700 }}>{loanId || '—'}</span>
          </p>
        </div>

        {/* Content Area */}
        {loading ? (
          <div style={{
            padding: '40px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}>
            <div style={{
              width: 38,
              height: 38,
              border: '3px solid rgba(255,255,255,0.1)',
              borderTopColor: '#00E599',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ color: '#94A3B8', fontSize: 13, fontWeight: 500 }}>
              Preparing your secure download links…
            </div>
          </div>
        ) : error ? (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 16,
            padding: '20px 16px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}>
            <AlertCircle size={32} color="#EF4444" />
            <div style={{ color: '#FCA5A5', fontSize: 13, lineHeight: 1.5 }}>
              {error}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Agreement download card */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 18,
              padding: '18px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(0, 229, 153, 0.12)',
                  border: '1px solid rgba(0, 229, 153, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#00E599',
                  flexShrink: 0,
                }}>
                  <FileText size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#FFFFFF' }}>
                    Loan Agreement
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                    Official signed terms & conditions (PDF)
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleDownload('agreement', agreementUrl, `loan-agreement-${loanId}.pdf`)}
                disabled={!agreementUrl || downloading.agreement}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 14,
                  border: 'none',
                  background: agreementUrl 
                    ? 'linear-gradient(135deg, #00E599 0%, #00B87A 100%)' 
                    : 'rgba(255,255,255,0.08)',
                  color: agreementUrl ? '#04100B' : '#64748B',
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: agreementUrl ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: agreementUrl ? '0 8px 20px -4px rgba(0, 229, 153, 0.4)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <Download size={16} />
                {downloading.agreement ? 'Downloading…' : 'Download Loan Agreement'}
              </button>
            </div>

            {/* Asset list download card */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 18,
              padding: '18px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60A5FA',
                  flexShrink: 0,
                }}>
                  <FileText size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#FFFFFF' }}>
                    Asset Declaration
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                    Verified collateral and pledged assets (PDF)
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleDownload('asset', assetUrl, `asset-list-${loanId}.pdf`)}
                disabled={!assetUrl || downloading.asset}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: assetUrl 
                    ? 'rgba(255, 255, 255, 0.08)' 
                    : 'rgba(255, 255, 255, 0.03)',
                  color: assetUrl ? '#FFFFFF' : '#64748B',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: assetUrl ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 0.2s ease',
                }}
              >
                <Download size={16} />
                {downloading.asset ? 'Downloading…' : 'Download Asset List'}
              </button>
            </div>

            {/* Quick guidance notice */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 11,
              color: '#64748B',
              textAlign: 'center',
              lineHeight: 1.5,
              marginTop: 4,
            }}>
              💡 Keep these PDFs safely stored on your device for your reference.
            </div>
          </div>
        )}

        {/* Footer info */}
        <div style={{
          marginTop: 28,
          paddingTop: 18,
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: '#64748B',
        }}>
          <div>Adequate Capital Ltd</div>
          <a
            href="/portal"
            style={{
              color: '#00E599',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 600,
            }}
          >
            Customer Portal <ArrowRight size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}