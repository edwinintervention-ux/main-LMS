import React, { useState, useEffect, useMemo } from 'react';
import { Card, CH, DT, Badge, T, Btn } from '@/lms-common';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Users, Clock, Activity, Map as MapIcon } from 'lucide-react';

// Fix for default leaflet marker icons in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const Stat = ({ label, val, color, sub, icon: Icon }) => (
  <Card style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
    <div style={{ width: 48, height: 48, borderRadius: 12, background: color ? `${color}22` : T.surface, color: color || T.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {Icon && <Icon size={24} />}
    </div>
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: T.text, marginTop: 4 }}>{val}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  </Card>
);

const WorkerAnalyticsDashboard = ({ workers = [] }) => {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { supabase } = await import('@/config/supabaseClient');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const isoDate = thirtyDaysAgo.toISOString().split('T')[0];

      const { data } = await supabase
        .from('worker_attendance')
        .select('*')
        .gte('date', isoDate);
        
      setAttendance(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const workerMap = new Map(workers.map(w => [w.id, w.name]));
    let totalLogs = 0;
    let onTimeLogs = 0;
    
    // Group by worker
    const byWorker = {};

    attendance.forEach(log => {
      if (!log.clock_in_time) return;
      totalLogs++;
      
      const d = new Date(log.clock_in_time);
      const day = d.getDay();
      
      let isLate = false;
      const hours = d.getHours();
      const mins = d.getMinutes();
      
      if (day === 6) {
        // Saturday: 9:00 AM
        if (hours > 9 || (hours === 9 && mins > 0)) isLate = true;
      } else {
        // Weekdays: 8:30 AM
        if (hours > 8 || (hours === 8 && mins > 30)) isLate = true;
      }

      if (!isLate) onTimeLogs++;

      if (!byWorker[log.worker_id]) {
         byWorker[log.worker_id] = { id: log.worker_id, name: workerMap.get(log.worker_id) || log.worker_id, total: 0, onTime: 0 };
      }
      byWorker[log.worker_id].total++;
      if (!isLate) byWorker[log.worker_id].onTime++;
    });

    const overallPunctuality = totalLogs > 0 ? Math.round((onTimeLogs / totalLogs) * 100) : 0;
    
    const workerScores = Object.values(byWorker).map(w => ({
      ...w,
      score: w.total > 0 ? Math.round((w.onTime / w.total) * 100) : 0
    })).sort((a, b) => b.score - a.score);

    return { overallPunctuality, workerScores };
  }, [attendance, workers]);

  // Today's Clock-ins
  const todayClockins = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const workerMap = new Map(workers.map(w => [w.id, w.name]));
    
    return attendance
      .filter(a => a.date === today && a.clock_in_lat && a.clock_in_lng)
      .map(a => ({
        ...a,
        name: workerMap.get(a.worker_id) || a.worker_id
      }));
  }, [attendance, workers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <Stat 
          label="Overall Punctuality (30 Days)" 
          val={`${stats.overallPunctuality}%`} 
          color={stats.overallPunctuality >= 90 ? T.ok : stats.overallPunctuality >= 75 ? T.warn : T.err} 
          icon={Activity} 
          sub="Percentage of on-time arrivals"
        />
        <Stat 
          label="Today's Clock-ins" 
          val={todayClockins.length} 
          color={T.accent} 
          icon={Users} 
          sub="Workers who clocked in today with GPS"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
        {/* Punctuality Leaderboard */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <CH title="Punctuality Scoreboard" icon={Clock} sub="Last 30 Days" />
          <div style={{ padding: '0 4px 10px' }}>
            <DT
              cols={[
                { k: 'name', l: 'Worker Name', r: v => <span style={{ fontWeight: 600 }}>{v}</span> },
                { k: 'total', l: 'Days Worked' },
                { k: 'score', l: 'Score', r: v => <Badge color={v >= 90 ? T.ok : v >= 75 ? T.warn : T.err}>{v}%</Badge> }
              ]}
              rows={stats.workerScores}
              loading={loading}
              emptyMsg="No attendance data for the last 30 days."
            />
          </div>
        </Card>

        {/* Live Map */}
        <Card style={{ padding: 0, overflow: 'hidden', minHeight: 400 }}>
          <CH title="Live Clock-in Map" icon={MapIcon} sub="Today's worker locations" />
          <div style={{ height: 400, width: '100%', background: T.surface }}>
            {todayClockins.length > 0 ? (
              <MapContainer 
                center={[todayClockins[0].clock_in_lat, todayClockins[0].clock_in_lng]} 
                zoom={12} 
                style={{ height: '100%', width: '100%', zIndex: 0 }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {todayClockins.map(log => (
                  <Marker key={log.id} position={[log.clock_in_lat, log.clock_in_lng]}>
                    <Popup>
                      <strong>{log.name}</strong><br />
                      Clock-in: {new Date(log.clock_in_time).toLocaleTimeString()}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.muted }}>
                No GPS clock-ins recorded today.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default WorkerAnalyticsDashboard;
