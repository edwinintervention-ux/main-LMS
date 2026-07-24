import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { T } from '@/lms-common';

export const CommandCenter = ({ customers, onClose, onSelect }) => {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const { theme } = useTheme();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    if (!q || q.length < 2) return [];
    const term = q.trim().toLowerCase();
    if (!term || term.length < 2) return [];
    const parts = term.split(/\s+/).filter(Boolean);
    const cleanTerm = q.replace(/\D/g, ''); 
    
    return customers.map(c => {
      let matchType = null;
      let matchedValue = '';

      const name = (c.name || '').toLowerCase();
      const n1n = (String(c.n1n || c.n1_name || '')).toLowerCase();
      const n1p = (String(c.n1p || c.n1_phone || '')).toLowerCase();
      const n2n = (String(c.n2n || c.n2_name || '')).toLowerCase();
      const n2p = (String(c.n2p || c.n2_phone || '')).toLowerCase();
      const n3n = (String(c.n3n || c.n3_name || '')).toLowerCase();
      const n3p = (String(c.n3p || c.n3_phone || '')).toLowerCase();

      if (parts.every(p => name.includes(p))) {
        matchType = 'Customer';
      } 
      else if (cleanTerm && (String(c.phone || c.phone_no || '')).replace(/\D/g, '').includes(cleanTerm)) {
        matchType = 'Phone';
      }
      else if (cleanTerm && (String(c.idNo || c.id_no || '')).toLowerCase().includes(cleanTerm.toLowerCase())) {
        matchType = 'ID Match';
      }
      else if (parts.every(p => n1n.includes(p)) && n1n.length > 0) {
        matchType = 'NOK';
        matchedValue = c.n1n || c.n1_name;
      }
      else if (cleanTerm && n1p.replace(/\D/g, '').includes(cleanTerm) && n1p.length > 0) {
        matchType = 'NOK Phone';
        matchedValue = c.n1n || c.n1_name;
      }
      else if (parts.every(p => n2n.includes(p)) && n2n.length > 0) {
        matchType = 'NOK';
        matchedValue = c.n2n || c.n2_name;
      }
      else if (cleanTerm && n2p.replace(/\D/g, '').includes(cleanTerm) && n2p.length > 0) {
        matchType = 'NOK Phone';
        matchedValue = c.n2n || c.n2_name;
      }
      else if (parts.every(p => n3n.includes(p)) && n3n.length > 0) {
        matchType = 'NOK';
        matchedValue = c.n3n || c.n3_name;
      }
      else if (cleanTerm && n3p.replace(/\D/g, '').includes(cleanTerm) && n3p.length > 0) {
        matchType = 'NOK Phone';
        matchedValue = c.n3n || c.n3_name;
      }

      if (matchType) return { ...c, matchType, matchedValue };
      return null;
    }).filter(Boolean).slice(0, 15);
  }, [customers, q]);

  return (
    <div 
      className="fade ios-sheet-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        className="pop glass"
        style={{ 
          width: '100%', maxWidth: 600, 
          borderRadius: 32, 
          background: theme === 'dark' ? 'rgba(26, 39, 64, 0.85)' : 'rgba(255, 255, 255, 0.9)',
          boxShadow: '0 50px 100px -20px rgba(0,0,0,0.6)',
          overflow: 'hidden' 
        }}
      >
        <div style={{ padding: '24px 24px 12px' }}>
          <div style={{ 
            background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', 
            borderRadius: 20, 
            padding: '4px 16px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12,
            border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`
          }}>
            <SearchIcon size={20} color={T.accent} strokeWidth={2.5} />
            <input 
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search customers or families..."
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: T.txt, fontSize: 17, height: 48, fontWeight: 600 }}
              onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
            />
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
               {q && <button onClick={() => setQ('')} style={{ background:'none', border:'none', color:T.dim, padding:4, cursor:'pointer' }}>✕</button>}
               <kbd style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', borderRadius: 6, padding: '3px 6px', fontSize: 10, color: T.dim, fontWeight: 700 }}>ESC</kbd>
            </div>
          </div>
        </div>

        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '0 12px 24px' }}>
          {q.length >= 2 && results.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center', color: T.dim }}>
              <div style={{ background: T.aLo, width: 64, height: 64, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: T.accent }}>
                <SearchIcon size={32} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>No matches found</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>We couldn't find a borrower with that info.</div>
            </div>
          )}
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {results.map(r => (
              <div 
                key={r.id}
                className="audit-row"
                onClick={() => { onSelect(r.id); onClose(); }}
                style={{ padding: '14px 16px', borderRadius: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all .25s ease' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ 
                    width: 48, height: 48, borderRadius: 16, 
                    background: `${T.accent}15`, color: T.accent, 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    fontSize: 20, fontWeight: 900,
                    border: `1.5px solid ${T.accent}30`
                  }}>
                    {r.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: T.txt, fontSize: 15, marginBottom: 2 }}>{r.name}</div>
                    <div style={{ color: T.dim, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'monospace' }}>{r.idNo || r.id_no}</span>
                      <span style={{ opacity: 0.5 }}>•</span>
                      <span>{r.phone || r.phone_no}</span>
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: T.accent, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, background: `${T.accent}15`, padding: '4px 10px', borderRadius: 8, display: 'inline-block' }}>
                    {r.matchType}
                  </div>
                  {r.matchedValue && (
                    <div style={{ fontSize: 11, color: T.dim, marginTop: 6, fontWeight: 600 }}>
                      via {r.matchedValue.substring(0, 15)}{r.matchedValue.length > 15 ? '...' : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div style={{ padding: '12px 24px', background: theme === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', borderTop: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, color: T.dim, fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
          <div>Search across clients, IDs, and emergency contacts</div>
          <div style={{ fontWeight: 700 }}>Adequate Capital LMS</div>
        </div>
      </div>
    </div>
  );
};
