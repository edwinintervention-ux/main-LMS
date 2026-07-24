import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SignatureCanvas from 'react-signature-canvas';
import { Btn, T } from '@/lms-common';
import { supabase } from '@/config/supabaseClient';

/**
 * Full‑screen signature capture page.
 * Props:
 *   loan – the loan object being signed.
 *   onClose – callback to close the page.
 *   onSave – (borrowerSig, officerSig) => void called after signatures are saved.
 */
const SignaturePage = ({ loan, onClose, onSave }) => {
  const borrowerRef = useRef(null);
  const officerRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const getBase64 = (canvas) => {
    const dataUrl = canvas?.toDataURL('image/png');
    return dataUrl?.split(',')[1]; // strip prefix
  };

  const handleSave = async () => {
    setSaving(true);
    const borrowerSig = getBase64(borrowerRef.current);
    const officerSig = getBase64(officerRef.current);
    try {
      const updates = {};
      if (borrowerSig) updates.borrower_signature = `data:image/png;base64,${borrowerSig}`;
      if (officerSig) updates.officer_signature = `data:image/png;base64,${officerSig}`;
      if (Object.keys(updates).length) {
        await supabase
          .from('loans')
          .update(updates)
          .eq('id', loan.id);
      }
      onSave(borrowerSig, officerSig);
    } catch (e) {
      console.error('Signature save error', e);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  const clear = (ref) => {
    ref?.clear();
  };

  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  const isMobile = vw < 600;
  const canvasWidth = isMobile ? vw - 40 : 500;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column', padding: isMobile ? 10 : 20, 
      zIndex: 999999, overflowY: 'auto'
    }}>
      <h2 style={{ color: T.txt, marginBottom: 12 }}>Sign Document</h2>
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <p style={{ color: T.dim, marginBottom: 8 }}>Borrower Signature</p>
          <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <SignatureCanvas
              ref={borrowerRef}
              backgroundColor="#fff"
              penColor="#000"
              canvasProps={{ width: canvasWidth, height: 200, className: 'sig-canvas' }}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Btn sm onClick={() => clear(borrowerRef.current)} v='secondary'>Clear</Btn>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <p style={{ color: T.dim, marginBottom: 8 }}>Officer Signature</p>
          <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <SignatureCanvas
              ref={officerRef}
              backgroundColor="#fff"
              penColor="#000"
              canvasProps={{ width: canvasWidth, height: 200, className: 'sig-canvas' }}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Btn sm onClick={() => clear(officerRef.current)} v='secondary'>Clear</Btn>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'flex-end', paddingBottom: 20 }}>
        <Btn onClick={onClose} v='secondary'>Cancel</Btn>
        <Btn onClick={handleSave} v='primary' disabled={saving}>Save</Btn>
      </div>
    </div>,
    document.body
  );
};

export default SignaturePage;
