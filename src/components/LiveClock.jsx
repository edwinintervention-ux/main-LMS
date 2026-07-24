import React, { useState, useEffect } from 'react';

export default function LiveClock({ color = '#E2E8F0', bg = '#111827', border = '#1E2D45' }) {
  const [liveTime, setLiveTime] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setLiveTime(new Date()), 50);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      flexShrink: 0,
      fontSize: 12,
      fontWeight: 700,
      color: color,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 10,
      padding: '4px 12px',
      letterSpacing: 0.5,
      zIndex: 1,
      fontVariantNumeric: 'tabular-nums',
      display: 'flex',
      alignItems: 'baseline',
      height: 32,
      justifyContent: 'center',
    }}>
      {liveTime.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      <span style={{ fontSize: '0.85em', opacity: 0.7, marginLeft: 2, display: 'inline-block', width: '22px' }}>
        .{Math.floor(liveTime.getMilliseconds() / 10).toString().padStart(2, '0')}
      </span>
    </div>
  );
}
