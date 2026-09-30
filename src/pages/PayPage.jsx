import React, { useEffect, useState } from 'react';

export default function PayPage() {
  const [account, setAccount] = useState('');
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAccount(params.get('account') || 'Your ID/Loan Number');
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#E2E8F0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      fontFamily: '"Inter", system-ui, sans-serif'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 24,
        padding: 40,
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
        textAlign: 'center'
      }}>
        <div style={{
          width: 60, height: 60, background: '#00D4AA20', color: '#00A884',
          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: 24
        }}>
          📱
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', margin: '0 0 10px' }}>
          Payment Instructions
        </h1>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 30, lineHeight: 1.5 }}>
          Follow these steps on your phone to make a payment to Adequate Capital via M-Pesa.
        </p>

        <div style={{ background: '#F8FAFC', padding: 20, borderRadius: 16, border: '1px solid #E2E8F0', textAlign: 'left' }}>
          <div style={{ marginBottom: 15 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}>
              M-Pesa Paybill
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#0F172A', marginTop: 4 }}>
              4166191
            </div>
          </div>
          
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}>
              Account Number
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#00D4AA', marginTop: 4 }}>
              {account}
            </div>
          </div>
        </div>
        
        <div style={{ marginTop: 30, fontSize: 13, color: '#64748B' }}>
          Thank you for choosing Adequate Capital Ltd.
        </div>
      </div>
    </div>
  );
}
