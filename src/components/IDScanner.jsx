import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, ScanLine, CheckCircle, AlertCircle, RotateCcw, X, Loader } from 'lucide-react';
import { T } from '@/lms-common';
import { supabase } from '@/config/supabaseClient';

/**
 * IDScanner — opens device camera, captures a frame, sends to Gemini Vision
 * via the `scan-id` Supabase edge function, and returns extracted fields.
 *
 * Props:
 *  onExtracted({ name, idNo, dob, gender }) — called when data is successfully read
 *  onClose() — called when user dismisses the scanner
 */
export default function IDScanner({ onExtracted, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [phase, setPhase] = useState('starting'); // starting | scanning | capturing | processing | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [extracted, setExtracted] = useState(null);
  const [facing, setFacing] = useState('environment'); // environment = rear cam

  // Start camera
  const startCamera = useCallback(async (facingMode = 'environment') => {
    setPhase('starting');
    setErrorMsg('');
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setPhase('scanning');
    } catch (err) {
      setErrorMsg('Camera access denied. Please allow camera permission and try again.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    startCamera(facing);
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const flipCamera = () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    startCamera(next);
  };

  const captureAndScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setPhase('capturing');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Get base64 from canvas (jpeg for smaller payload)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];

    setPhase('processing');

    try {
      const { data, error } = await supabase.functions.invoke('scan-id', {
        body: { imageBase64: base64, mimeType: 'image/jpeg' }
      });

      if (error) throw new Error(error.message || 'Edge function error');
      if (!data?.success) throw new Error(data?.error || 'Scan failed');

      setExtracted(data.data);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to read ID. Please try again.');
      setPhase('error');
    }
  }, []);

  const handleAccept = () => {
    if (extracted) {
      onExtracted(extracted);
    }
  };

  const retry = () => {
    setExtracted(null);
    setErrorMsg('');
    startCamera(facing);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 16
    }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 560, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ScanLine size={20} color={T.accent} />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>ID Scanner</span>
          <span style={{ color: '#aaa', fontSize: 12 }}>— AI-powered</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', padding: 4 }}>
          <X size={22} />
        </button>
      </div>

      {/* Instruction */}
      {(phase === 'scanning') && (
        <div style={{ color: '#ccc', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
          Hold the <strong style={{ color: '#fff' }}>front of the Kenyan ID card</strong> flat and steady inside the frame, then press Scan.
        </div>
      )}

      {/* Camera viewfinder */}
      {(phase === 'starting' || phase === 'scanning' || phase === 'capturing') && (
        <div style={{ position: 'relative', width: '100%', maxWidth: 560, borderRadius: 16, overflow: 'hidden', background: '#111', border: `2px solid ${T.accent}` }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}
          />
          {/* Corner guides */}
          {['tl','tr','bl','br'].map(c => (
            <div key={c} style={{
              position: 'absolute',
              width: 28, height: 28,
              top: c.startsWith('t') ? 14 : undefined,
              bottom: c.startsWith('b') ? 14 : undefined,
              left: c.endsWith('l') ? 14 : undefined,
              right: c.endsWith('r') ? 14 : undefined,
              borderTop: c.startsWith('t') ? `3px solid ${T.accent}` : 'none',
              borderBottom: c.startsWith('b') ? `3px solid ${T.accent}` : 'none',
              borderLeft: c.endsWith('l') ? `3px solid ${T.accent}` : 'none',
              borderRight: c.endsWith('r') ? `3px solid ${T.accent}` : 'none',
              borderRadius: c === 'tl' ? '4px 0 0 0' : c === 'tr' ? '0 4px 0 0' : c === 'bl' ? '0 0 0 4px' : '0 0 4px 0'
            }} />
          ))}
          {phase === 'starting' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ color: '#fff', fontSize: 13 }}>Starting camera...</div>
            </div>
          )}
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Scan button */}
      {phase === 'scanning' && (
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button
            onClick={flipCamera}
            style={{ background: '#333', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={15} /> Flip
          </button>
          <button
            onClick={captureAndScan}
            style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 28px', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Camera size={16} /> Scan ID
          </button>
        </div>
      )}

      {/* Processing */}
      {phase === 'processing' && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, border: `3px solid ${T.accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div style={{ color: '#ccc', fontSize: 14 }}>Reading ID with AI...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div style={{ marginTop: 20, textAlign: 'center', maxWidth: 420 }}>
          <AlertCircle size={36} color="#f04438" style={{ marginBottom: 10 }} />
          <div style={{ color: '#f04438', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Scan Failed</div>
          <div style={{ color: '#bbb', fontSize: 13, marginBottom: 20 }}>{errorMsg}</div>
          <button
            onClick={retry}
            style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontWeight: 700 }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Results */}
      {phase === 'done' && extracted && (
        <div style={{ marginTop: 16, width: '100%', maxWidth: 520 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <CheckCircle size={20} color="#12b76a" />
            <span style={{ color: '#12b76a', fontWeight: 700, fontSize: 15 }}>ID Read Successfully</span>
          </div>
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
            {[
              { label: 'Full Name', val: extracted.name },
              { label: 'ID Number', val: extracted.idNo },
              { label: 'Date of Birth', val: extracted.dob },
              { label: 'Gender', val: extracted.gender },
            ].map(({ label, val }) => (
              <div key={label}>
                <div style={{ color: '#888', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{label}</div>
                <div style={{ color: val ? '#fff' : '#555', fontSize: 14, fontWeight: val ? 600 : 400 }}>
                  {val || <em style={{ color: '#555' }}>Not detected</em>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ color: '#888', fontSize: 11, marginTop: 8 }}>
            ⚠️ Please verify all fields are correct before accepting.
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
            <button
              onClick={retry}
              style={{ flex: 1, background: '#333', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <RotateCcw size={15} /> Rescan
            </button>
            <button
              onClick={handleAccept}
              style={{ flex: 2, background: '#12b76a', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 }}
            >
              <CheckCircle size={16} /> Use This Data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
