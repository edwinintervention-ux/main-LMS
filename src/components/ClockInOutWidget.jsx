import React, { useState, useEffect, useRef } from 'react';
import { T, SFX } from '@/lms-common';
import { Clock } from 'lucide-react';

/**
 * ClockInOutWidget
 * ─────────────────────────────────────────────────────────────────────────────
 * Silently captures exact GPS coordinates when the worker clocks in or out.
 * Location is MANDATORY — the action is blocked if location cannot be obtained.
 * Location data is invisible to the worker; only admin/superadmin see it.
 */
const ClockInOutWidget = ({ worker, themeColor }) => {
  const [record, setRecord]     = useState(null);   // today's attendance record
  const [loading, setLoading]   = useState(true);    // initial fetch loading
  const [clocking, setClocking] = useState(false);   // action in progress
  const [locError, setLocError] = useState(null);    // location-blocked error
  const mountedRef = useRef(true);

  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // ── Fetch today's record on mount ──────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (!worker?.id) { setLoading(false); return; }

    import('@/config/supabaseClient').then(({ supabase }) => {
      if (!supabase || !mountedRef.current) return;
      supabase
        .from('worker_attendance')
        .select('*')
        .eq('worker_id', worker.id)
        .eq('date', todayStr)
        .maybeSingle()
        .then(({ data }) => {
          if (mountedRef.current) {
            setRecord(data || null);
            setLoading(false);
          }
        });
    });

    return () => { mountedRef.current = false; };
  }, [worker?.id, todayStr]);

  // ── Geolocation helper — returns Promise<{lat, lng}> ──────────────────────
  const getLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            reject(new Error('DENIED'));
          } else {
            reject(new Error(err.message || 'Unable to obtain location.'));
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

  // ── Clock In ───────────────────────────────────────────────────────────────
  const handleClockIn = async () => {
    setClocking(true);
    setLocError(null);
    try {
      const { lat, lng } = await getLocation();
      const now = new Date().toISOString();

      const { supabase } = await import('@/config/supabaseClient');
      if (!supabase) throw new Error('No database connection.');

      const { data, error } = await supabase
        .from('worker_attendance')
        .insert({
          worker_id:      worker.id,
          date:           todayStr,
          clock_in_time:  now,
          clock_in_lat:   lat,
          clock_in_lng:   lng,
        })
        .select()
        .single();

      if (error) throw error;
      if (mountedRef.current) setRecord(data);
      try { SFX.save(); } catch (e) {}
    } catch (err) {
      if (mountedRef.current) {
        setLocError(err.message === 'DENIED' ? 'DENIED' : err.message);
      }
    } finally {
      if (mountedRef.current) setClocking(false);
    }
  };

  // ── Clock Out ──────────────────────────────────────────────────────────────
  const handleClockOut = async () => {
    if (!record?.id) return;
    setClocking(true);
    setLocError(null);
    try {
      const { lat, lng } = await getLocation();
      const now = new Date().toISOString();

      const { supabase } = await import('@/config/supabaseClient');
      if (!supabase) throw new Error('No database connection.');

      const { data, error } = await supabase
        .from('worker_attendance')
        .update({
          clock_out_time: now,
          clock_out_lat:  lat,
          clock_out_lng:  lng,
        })
        .eq('id', record.id)
        .select()
        .single();

      if (error) throw error;
      if (mountedRef.current) setRecord(data);
      try { SFX.save(); } catch (e) {}
    } catch (err) {
      if (mountedRef.current) {
        setLocError(err.message === 'DENIED' ? 'DENIED' : err.message);
      }
    } finally {
      if (mountedRef.current) setClocking(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fmtTime = (iso) => {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  };

  const isClockedIn  = !!record?.clock_in_time;
  const isClockedOut = !!record?.clock_out_time;
  const color        = themeColor || T.accent;

  // ── States ─────────────────────────────────────────────────────────────────
  if (loading) return null; // Don't flash while fetching

  // Location denied — blocking error state
  if (locError) {
    const isDenied = locError === 'DENIED';
    return (
      <div style={{
        margin: '8px 10px 4px',
        padding: '12px 14px',
        borderRadius: 14,
        background: `${T.danger}14`,
        border: `1px solid ${T.danger}50`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.danger, marginBottom: 6 }}>
          📍 Location Required
        </div>
        <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, marginBottom: 10 }}>
          {isDenied
            ? 'Location access was blocked. To clock in/out, please enable location permissions:'
            : `Location error: ${locError}`}
        </div>
        {isDenied && (
          <div style={{ fontSize: 10.5, color: T.dim, lineHeight: 1.6, marginBottom: 10 }}>
            <strong style={{ color: T.txt }}>Chrome/Edge:</strong> Click the 🔒 lock icon in the address bar → Site settings → Location → Allow<br />
            <strong style={{ color: T.txt }}>Safari:</strong> Settings → {worker?.name?.split(' ')[0] || 'App'} → Location → Allow<br />
            <strong style={{ color: T.txt }}>Firefox:</strong> Click the shield icon → Permissions → Allow Location
          </div>
        )}
        <button
          onClick={() => { setLocError(null); }}
          style={{
            width: '100%', padding: '8px 0', borderRadius: 10,
            background: `${T.danger}20`, border: `1px solid ${T.danger}40`,
            color: T.danger, fontSize: 12, fontWeight: 800, cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  // Fully clocked out for the day
  if (isClockedOut) {
    return (
      <div style={{
        margin: '8px 10px 4px',
        padding: '12px 14px',
        borderRadius: 14,
        background: `${T.ok}12`,
        border: `1px solid ${T.ok}40`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: T.ok, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} /> Attendance Recorded
        </div>
        <div style={{ fontSize: 10.5, color: T.dim }}>
          In: <strong style={{ color: T.txt }}>{fmtTime(record.clock_in_time)}</strong>
          {'  ·  '}
          Out: <strong style={{ color: T.txt }}>{fmtTime(record.clock_out_time)}</strong>
        </div>
      </div>
    );
  }

  // Clocked in, not yet clocked out
  if (isClockedIn) {
    return (
      <div style={{ margin: '8px 10px 4px' }}>
        <div style={{
          padding: '10px 14px',
          borderRadius: 14,
          background: `${T.ok}12`,
          border: `1px solid ${T.ok}40`,
          marginBottom: 6,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: T.ok, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={12} /> Clocked In
          </div>
          <div style={{ fontSize: 10, color: T.dim }}>Since {fmtTime(record.clock_in_time)}</div>
        </div>
        <button
          onClick={handleClockOut}
          disabled={clocking}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 12,
            background: clocking ? T.card2 : `${T.danger}18`,
            border: `1px solid ${clocking ? T.border : T.danger + '50'}`,
            color: clocking ? T.dim : T.danger,
            fontSize: 12.5, fontWeight: 800,
            cursor: clocking ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'all 0.2s',
          }}
        >
          <Clock size={14} />
          {clocking ? 'Please wait...' : 'Clock Out'}
        </button>
      </div>
    );
  }

  // Default: not yet clocked in today
  return (
    <div style={{ margin: '8px 10px 4px' }}>
      <button
        onClick={handleClockIn}
        disabled={clocking}
        style={{
          width: '100%', padding: '10px 0', borderRadius: 12,
          background: clocking ? T.card2 : `${color}18`,
          border: `1px solid ${clocking ? T.border : color + '50'}`,
          color: clocking ? T.dim : color,
          fontSize: 12.5, fontWeight: 800,
          cursor: clocking ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          transition: 'all 0.2s',
        }}
      >
        <Clock size={14} />
        {clocking ? 'Please wait...' : 'Clock In'}
      </button>
    </div>
  );
};

export default ClockInOutWidget;
