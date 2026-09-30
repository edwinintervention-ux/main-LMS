/**
 * CallSystem.jsx
 * In-system WebRTC voice calling via Supabase Realtime signaling.
 *
 * Architecture:
 *  - Each user listens on their OWN inbox: `inbox:{userId}`
 *  - Caller subscribes to `session:{callId}` FIRST (before sending offer)
 *  - Callee subscribes to `session:{callId}` FIRST (before sending answer)
 *  - ICE candidates are buffered until remote description is set
 *  - Audio unlocked via user-gesture (answer/call button click)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, PlayCircle, PauseCircle } from 'lucide-react';
import { T } from '@/lms-common';

// ── Supabase lazy import ──────────────────────────────────────────────────────
const getSB = () => import('@/config/supabaseClient').then(m => m.supabase);

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    }
  ]
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDur = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// Unlock AudioContext with a dummy sound (needs to be called from a click handler)
let audioCtx = null;
const getAudioCtx = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
};

// Global audio element to prevent GC and handle Safari autoplay policies
let globalAudioEl = null;
const getGlobalAudio = () => {
  if (!globalAudioEl) {
    globalAudioEl = document.createElement('audio');
    globalAudioEl.autoplay = true;
    globalAudioEl.playsInline = true; // Crucial for iOS
    globalAudioEl.controls = true; // Trick mobile browsers into allowing autoplay
    globalAudioEl.style.display = 'none'; // Hide the controls
    document.body.appendChild(globalAudioEl);
  }
  return globalAudioEl;
};

const playBeep = (freq1 = 480, freq2 = 620, duration = 1.2, volume = 0.25) => {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.setValueAtTime(freq1, ctx.currentTime);
    o.frequency.setValueAtTime(freq2, ctx.currentTime + duration / 2);
    g.gain.setValueAtTime(volume, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.start();
    o.stop(ctx.currentTime + duration);
  } catch (e) { /* silent */ }
};

// ── DB helpers ────────────────────────────────────────────────────────────────
const saveCall = async (record) => {
  const sb = await getSB();
  if (!sb) return null;
  const { data } = await sb.from('calls').insert([record]).select().single();
  return data;
};
const updateCall = async (id, updates) => {
  const sb = await getSB();
  if (!sb || !id) return;
  await sb.from('calls').update(updates).eq('id', id);
};

// ── Recording ─────────────────────────────────────────────────────────────────
const startRec = (stream, callId, onDone) => {
  try {
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const sb = await getSB();
      if (sb && callId) {
        const fn = `call_${callId}_${Date.now()}.webm`;
        const { data } = await sb.storage.from('call-recordings').upload(fn, blob, { contentType: 'audio/webm' });
        if (data?.path) onDone(data.path);
      }
    };
    rec.start(1000);
    return rec;
  } catch (e) {
    console.warn('[Call] Recording unavailable:', e.message);
    return null;
  }
};

// ── Wait for Supabase channel to be SUBSCRIBED ────────────────────────────────
const waitSubscribed = (ch) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Channel subscribe timeout')), 8000);
    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(ch); }
      if (status === 'CHANNEL_ERROR') { clearTimeout(timer); reject(err); }
    });
  });

// ═══════════════════════════════════════════════════════════════════════════════
//  CORE CALL ENGINE HOOK
// ═══════════════════════════════════════════════════════════════════════════════
const useCallEngine = ({ userId, userName, listenForIncoming = false }) => {
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [callState, setCallState] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const sessionChRef = useRef(null);
  const inboxChRef = useRef(null);
  const callerInboxChRef = useRef(null); // temp inbox while waiting for answer
  const timerRef = useRef(null);
  const recRef = useRef(null);
  const ringIvRef = useRef(null);
  const secondsRef = useRef(0);
  const iceCandidateBuffer = useRef([]);
  const myCandidatesRef = useRef([]);
  const remoteDescSet = useRef(false);

  // Keep secondsRef in sync so callbacks can read latest value without stale closure
  useEffect(() => { secondsRef.current = seconds; }, [seconds]);

  // ── Ring control ─────────────────────────────────────────────────────────────
  const startRinging = useCallback(() => {
    clearInterval(ringIvRef.current);
    playBeep();
    ringIvRef.current = setInterval(() => playBeep(), 3000);
  }, []);

  const stopRinging = useCallback(() => {
    clearInterval(ringIvRef.current);
    ringIvRef.current = null;
  }, []);

  // ── Full cleanup ─────────────────────────────────────────────────────────────
  const cleanup = useCallback(async (finalStatus, callId) => {
    stopRinging();
    clearInterval(timerRef.current);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (sessionChRef.current) {
      sessionChRef.current.unsubscribe();
      sessionChRef.current = null;
    }
    if (callerInboxChRef.current) {
      callerInboxChRef.current.unsubscribe();
      callerInboxChRef.current = null;
    }
    if (recRef.current && recRef.current.state !== 'inactive') {
      recRef.current.stop();
    }
    if (globalAudioEl) {
      globalAudioEl.srcObject = null;
    }

    iceCandidateBuffer.current = [];
    myCandidatesRef.current = [];
    remoteDescSet.current = false;

    if (finalStatus && callId) {
      await updateCall(callId, {
        status: finalStatus,
        ended_at: new Date().toISOString(),
        duration_seconds: secondsRef.current,
      });
    }

    setActiveCall(null);
    setCallState('idle');
    setSeconds(0);
    setMuted(false);
    setIncomingCall(null);
  }, [stopRinging]);

  // ── Start the call timer ──────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    const t0 = Date.now();
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSeconds(s);
    }, 1000);
  }, []);

  // ── Apply buffered ICE candidates ─────────────────────────────────────────────
  const applyBufferedCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const candidate of iceCandidateBuffer.current) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => { });
    }
    iceCandidateBuffer.current = [];
  }, []);

  // ── Build a session channel (subscribed before use) ───────────────────────────
  const buildSessionChannel = useCallback(async (callId, role) => {
    const sb = await getSB();
    const ch = sb.channel(`session:${callId}`);

    // ICE candidate handler — buffer until remote desc is ready
    ch.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      if (payload.from === role) return; // ignore own
      if (remoteDescSet.current && pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => { });
      } else {
        iceCandidateBuffer.current.push(payload.candidate);
      }
    });

    // Bulk ICE sync handler (for candidates lost before subscription)
    ch.on('broadcast', { event: 'ice-sync' }, async ({ payload }) => {
      if (payload.from === role) return; // ignore own
      for (const candidate of payload.candidates) {
        if (remoteDescSet.current && pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => { });
        } else {
          iceCandidateBuffer.current.push(candidate);
        }
      }
    });

    // Remote hangup
    ch.on('broadcast', { event: 'hangup' }, () => {
      cleanup('completed', activeCall?.callId || null);
    });

    // Await confirmed subscription before returning
    await waitSubscribed(ch);
    sessionChRef.current = ch;
    return ch;
  }, [cleanup, activeCall]);

  // ── Get microphone ─────────────────────────────────────────────────────────────
  const getMic = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  };

  // ── Create PeerConnection ──────────────────────────────────────────────────────
  const createPC = (stream, ch, role, callId) => {
    const pc = new RTCPeerConnection(ICE);
    pcRef.current = pc;

    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    // Remote audio — reuse persistent Audio element to beat GC & Safari autoplay limits
    pc.ontrack = (e) => {
      const audioEl = getGlobalAudio();
      audioEl.srcObject = e.streams[0];
      audioEl.play().catch(() => {
        document.addEventListener('click', () => audioEl.play().catch(() => { }), { once: true });
      });
    };

    // Trickle ICE
    pc.onicecandidate = (e) => {
      if (e.candidate && ch) {
        myCandidatesRef.current.push(e.candidate);
        ch.send({
          type: 'broadcast', event: 'ice',
          payload: { candidate: e.candidate, from: role }
        }).catch(() => { });
      }
    };

    return pc;
  };

  // ── Subscribe to inbox (callee/listener only) ──────────────────────────────────
  useEffect(() => {
    if (!userId || !listenForIncoming) return;
    let ch;
    (async () => {
      const sb = await getSB();
      if (!sb) return;
      ch = sb.channel(`inbox:${userId}`);

      ch.on('broadcast', { event: 'incoming-call' }, async ({ payload }) => {
        setIncomingCall(payload);
        setCallState('ringing');
        // PRE-SUBSCRIBE to session channel to catch trickle ICE candidates while ringing!
        if (!sessionChRef.current) {
          await buildSessionChannel(payload.callId, 'callee');
        }
      });

      ch.on('broadcast', { event: 'call-cancelled' }, () => {
        stopRinging();
        setIncomingCall(null);
        setCallState('idle');
      });

      await ch.subscribe();
      inboxChRef.current = ch;
    })();

    return () => {
      ch?.unsubscribe();
      stopRinging();
    };
  }, [userId, listenForIncoming, stopRinging]);

  // ── CALL (initiate) ────────────────────────────────────────────────────────────
  const call = useCallback(async ({ peerId, peerName }) => {
    if (callState !== 'idle') return;
    setCallState('calling');

    // ── CRITICAL: Request mic FIRST, within user-gesture context ───────────────
    // Mobile browsers (iOS Safari, Android Chrome) require getUserMedia() to be
    // called synchronously within the click handler. Any await before this will
    // expire the gesture context and silently return a muted/empty audio track,
    // causing one-way audio (caller can't be heard by callee).
    getAudioCtx();
    getGlobalAudio().play().catch(() => {});
    let stream;
    try {
      stream = await getMic(); // MUST be first async op — still within gesture context
    } catch (e) {
      console.error('[Call] Microphone access denied:', e);
      setCallState('idle');
      return;
    }
    startRinging();

    const log = await saveCall({
      caller_id: userId, caller_name: userName,
      receiver_id: peerId, receiver_name: peerName,
      status: 'initiated', initiated_at: new Date().toISOString(),
    });
    const callId = log?.id;
    setActiveCall({ callId, peerId, peerName, role: 'caller' });

    try {
      // 1. Subscribe to session channel FIRST so we don't miss the answer
      const ch = await buildSessionChannel(callId, 'caller');

      // 2. Create PeerConnection NOW using the already-obtained stream
      const pc = createPC(stream, ch, 'caller', callId);

      // 3. Listen for answer
      ch.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (!payload.sdp) return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        remoteDescSet.current = true;
        await applyBufferedCandidates();

        // The callee is now fully connected. Resend all our ICE candidates to ensure none were lost.
        ch.send({
          type: 'broadcast', event: 'ice-sync',
          payload: { candidates: myCandidatesRef.current, from: 'caller' }
        }).catch(() => {});

        stopRinging();
        if (callerInboxChRef.current) {
          callerInboxChRef.current.unsubscribe();
          callerInboxChRef.current = null;
        }
        setCallState('connected');
        await updateCall(callId, { status: 'connected', started_at: new Date().toISOString() });
        startTimer();
        recRef.current = startRec(localStreamRef.current, callId, path => updateCall(callId, { recording_url: path }));
      });

      // 4. Subscribe to caller's own inbox to receive decline/cancel from callee
      const sb = await getSB();
      const callerInbox = sb.channel(`inbox:${userId}`);
      callerInbox.on('broadcast', { event: 'call-cancelled' }, () => {
        stopRinging();
        callerInboxChRef.current?.unsubscribe();
        callerInboxChRef.current = null;
        cleanup('declined', callId);
      });
      await callerInbox.subscribe();
      callerInboxChRef.current = callerInbox;

      // 5. Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 6. Deliver to receiver's inbox
      const inbox = sb.channel(`inbox:${peerId}`);
      await inbox.subscribe();
      await inbox.send({
        type: 'broadcast', event: 'incoming-call',
        payload: { callId, callerId: userId, callerName: userName, sdp: pc.localDescription }
      });
      inbox.unsubscribe();

      // 7. Auto-missed after 30s
      setTimeout(() => {
        if (callState === 'calling') {
          stopRinging();
          callerInboxChRef.current?.unsubscribe();
          callerInboxChRef.current = null;
          cleanup('missed', callId);
        }
      }, 30000);

    } catch (e) {
      console.error('[Call] Initiate failed:', e);
      stopRinging();
      cleanup('failed', callId);
    }
  }, [callState, userId, userName, buildSessionChannel, applyBufferedCandidates, startRinging, stopRinging, startTimer, cleanup]);

  // ── ANSWER ─────────────────────────────────────────────────────────────────────
  const answer = useCallback(async () => {
    if (!incomingCall) return;
    const { callId, callerId, callerName, sdp } = incomingCall;

    // Unlock audio BEFORE async work (we're inside a click handler)
    getAudioCtx();
    getGlobalAudio().play().catch(() => {}); // Bless audio element
    stopRinging();

    setActiveCall({ callId, peerId: callerId, peerName: callerName, role: 'callee' });
    setCallState('connected');
    setIncomingCall(null);

    try {
      // 1. Subscribe to session channel FIRST (reuse pre-subscribed if available)
      const ch = sessionChRef.current || await buildSessionChannel(callId, 'callee');

      // 2. Get mic and create PeerConnection
      const stream = await getMic();
      const pc = createPC(stream, ch, 'callee', callId);

      // 3. Set remote description (offer from caller)
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      remoteDescSet.current = true;
      await applyBufferedCandidates();

      // 4. Create and send answer
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await ch.send({ type: 'broadcast', event: 'answer', payload: { sdp: pc.localDescription } });

      // Callee also sends bulk ice-sync as a fallback for any missed trickle candidates
      ch.send({
        type: 'broadcast', event: 'ice-sync',
        payload: { candidates: myCandidatesRef.current, from: 'callee' }
      }).catch(() => {});

      // 5. Update DB and start timer
      await updateCall(callId, { status: 'connected', started_at: new Date().toISOString() });
      startTimer();
      recRef.current = startRec(stream, callId, path => updateCall(callId, { recording_url: path }));

    } catch (e) {
      console.error('[Call] Answer failed:', e);
      cleanup('failed', callId);
    }
  }, [incomingCall, buildSessionChannel, applyBufferedCandidates, stopRinging, startTimer, cleanup]);

  // ── DECLINE ────────────────────────────────────────────────────────────────────
  const decline = useCallback(async () => {
    stopRinging();
    if (incomingCall) {
      const sb = await getSB();
      const inbox = sb?.channel(`inbox:${incomingCall.callerId}`);
      if (inbox) {
        await inbox.subscribe();
        await inbox.send({ type: 'broadcast', event: 'call-cancelled', payload: {} });
        inbox.unsubscribe();
      }
      await updateCall(incomingCall.callId, { status: 'declined', ended_at: new Date().toISOString() });
    }
    setIncomingCall(null);
    setCallState('idle');
  }, [incomingCall, stopRinging]);

  // ── HANG UP ────────────────────────────────────────────────────────────────────
  const hangUp = useCallback(() => {
    if (sessionChRef.current) {
      sessionChRef.current.send({ type: 'broadcast', event: 'hangup', payload: {} }).catch(() => { });
    }
    cleanup('completed', activeCall?.callId);
  }, [activeCall, cleanup]);

  // ── MUTE ───────────────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMuted(m => !m); }
  }, []);

  return {
    incomingCall, activeCall, callState, seconds, muted,
    call, answer, decline, hangUp, toggleMute, startRinging,
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
//  CALL BUTTON — for initiating a call
// ═══════════════════════════════════════════════════════════════════════════════
export const CallButton = ({ currentUser, targetUser }) => {
  const { callState, seconds, muted, call, hangUp, toggleMute } = useCallEngine({
    userId: currentUser?.id,
    userName: currentUser?.name,
    listenForIncoming: false,
  });

  if (callState === 'idle') return (
    <button
      id={`call-btn-${targetUser?.id}`}
      onClick={() => call({ peerId: targetUser?.id, peerName: targetUser?.name })}
      title={`Call ${targetUser?.name}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '7px 14px', borderRadius: 99, cursor: 'pointer',
        background: `${T.ok}20`, border: `1px solid ${T.ok}50`, color: T.ok,
        fontWeight: 700, fontSize: 12, transition: 'all 0.15s',
      }}
    >
      <Phone size={13} /> Call
    </button>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '8px 14px', borderRadius: 14,
      background: callState === 'calling' ? `${T.warn}15` : `${T.ok}15`,
      border: `1px solid ${callState === 'calling' ? T.warn : T.ok}40`,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: callState === 'calling' ? T.warn : T.ok,
        animation: 'cpulse 1.2s ease-in-out infinite'
      }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: T.txt }}>
        {callState === 'calling'
          ? `Calling ${targetUser?.name}…`
          : `${targetUser?.name} · ${fmtDur(seconds)}`}
      </span>
      {callState === 'connected' && (
        <button onClick={toggleMute} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted ? T.danger : T.muted }}>
          {muted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
      )}
      <button
        onClick={hangUp}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 99, border: 'none',
          background: T.danger, color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer'
        }}
      >
        <PhoneOff size={12} /> End
      </button>
      <style>{`@keyframes cpulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  INCOMING CALL OVERLAY — mounted persistently for any logged-in user
// ═══════════════════════════════════════════════════════════════════════════════
export const IncomingCallListener = ({ currentUser }) => {
  const {
    incomingCall, activeCall, callState, seconds, muted,
    answer, decline, hangUp, toggleMute, startRinging,
  } = useCallEngine({
    userId: currentUser?.id,
    userName: currentUser?.name,
    listenForIncoming: true,
  });

  // Trigger ringing when popup appears (the useEffect is after render, so AudioContext is unlocked from prior gesture)
  useEffect(() => {
    if (callState === 'ringing') {
      startRinging();
    }
  }, [callState, startRinging]);

  if (callState === 'idle') return null;

  const isRinging = callState === 'ringing' && incomingCall;
  const isConnected = callState === 'connected' && activeCall;
  const callerName = isRinging ? incomingCall.callerName : activeCall?.peerName;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: T.card, borderRadius: 22,
      border: `1.5px solid ${T.accent}50`,
      boxShadow: `0 8px 40px rgba(0,0,0,0.5), 0 0 0 3px ${T.accent}20`,
      padding: '18px 22px', minWidth: 270,
      backdropFilter: 'blur(20px)',
    }}>
      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: `${T.accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 900, color: T.accent,
          animation: isRinging ? 'rpulse 1.2s ease-in-out infinite' : 'none',
        }}>
          {(callerName || 'A')[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
            {isRinging ? 'Incoming Call' : `In Call · ${fmtDur(seconds)}`}
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: T.txt }}>{callerName}</div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {isRinging && (
          <>
            <button
              id="accept-call"
              onClick={answer}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 12px', borderRadius: 99, border: 'none',
                background: T.ok, color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer'
              }}
            >
              <Phone size={13} /> Accept
            </button>
            <button
              id="decline-call"
              onClick={decline}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 12px', borderRadius: 99, border: 'none',
                background: T.danger, color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer'
              }}
            >
              <PhoneOff size={13} /> Decline
            </button>
          </>
        )}
        {isConnected && (
          <>
            <button
              onClick={toggleMute}
              style={{
                padding: '9px 14px', borderRadius: 99,
                border: `1px solid ${muted ? T.danger : T.border}`,
                background: muted ? `${T.danger}20` : 'transparent',
                color: muted ? T.danger : T.muted,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 700
              }}
            >
              {muted ? <MicOff size={13} /> : <Mic size={13} />} {muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              id="end-call"
              onClick={hangUp}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 12px', borderRadius: 99, border: 'none',
                background: T.danger, color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer'
              }}
            >
              <PhoneOff size={13} /> End Call
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes rpulse {
          0%, 100% { box-shadow: 0 0 0 6px ${T.accent}20; }
          50% { box-shadow: 0 0 0 14px ${T.accent}05; }
        }
      `}</style>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  CALL LOG — call history with playback
// ═══════════════════════════════════════════════════════════════════════════════
export const CallLog = ({ userId, userName }) => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const sb = await getSB();
      if (!sb) { setLoading(false); return; }
      const { data } = await sb
        .from('calls').select('*')
        .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('initiated_at', { ascending: false })
        .limit(50);
      setCalls(data || []);
      setLoading(false);
    })();
  }, [userId]);

  const playRec = async (c) => {
    if (playingId === c.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (!c.recording_url) return;
    const sb = await getSB();
    if (!sb) return;
    const { data } = await sb.storage.from('call-recordings').createSignedUrl(c.recording_url, 3600);
    if (data?.signedUrl) {
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = data.signedUrl;
      audioRef.current.play();
      setPlayingId(c.id);
      audioRef.current.onended = () => setPlayingId(null);
    }
  };

  const statusColor = s => ({ completed: T.ok, missed: T.warn, declined: T.danger, failed: T.danger }[s] || T.muted);
  const statusIcon = s => ({ completed: '✅', missed: '📵', declined: '❌', failed: '⚠️', initiated: '📞', connected: '🔵' }[s] || '⏳');

  if (loading) return <div style={{ color: T.muted, padding: 20, textAlign: 'center' }}>Loading call history…</div>;
  if (!calls.length) return (
    <div style={{ padding: 32, textAlign: 'center', color: T.muted }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📞</div>
      <div style={{ fontWeight: 700 }}>No calls yet</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>Calls with {userName} will appear here.</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: T.muted, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
        Call History · {calls.length} records
      </div>
      {calls.map(c => (
        <div key={c.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '11px 14px', borderRadius: 12, marginBottom: 8,
          background: T.card2, border: `1px solid ${T.border}`
        }}>
          <div style={{ fontSize: 20 }}>{statusIcon(c.status)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.txt }}>{c.caller_name} → {c.receiver_name}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              {new Date(c.initiated_at).toLocaleString('en-KE')}
              {c.duration_seconds ? ` · ${fmtDur(c.duration_seconds)}` : ''}
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: statusColor(c.status), textTransform: 'uppercase' }}>
            {c.status}
          </div>
          {c.recording_url && (
            <button
              id={`play-${c.id}`}
              onClick={() => playRec(c)}
              title="Play recording"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: playingId === c.id ? T.accent : T.muted }}
            >
              {playingId === c.id ? <PauseCircle size={18} /> : <PlayCircle size={18} />}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
