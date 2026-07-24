import React, { useState, useEffect, useMemo } from 'react';
import { T } from '@/lms-common';

/* ─────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good Morning',  emoji: '☀️' };
  if (h < 17) return { text: 'Good Afternoon', emoji: '👋' };
  return       { text: 'Good Evening',   emoji: '🌙' };
}

function firstName(name = '') {
  return name.trim().split(' ')[0] || 'there';
}

/**
 * Generate a motivational comment from the worker's live metrics.
 * All messages are positive and forward-looking.
 */
function buildMotivation({
  role,
  targetPct = 0,        // 0-100: % of monthly disbursement/collection target
  onboarded = 0,        // customers onboarded this month (Loan Officer)
  onboardingTarget = 60,
  overdueCount = 0,     // overdue loans in portfolio
  leadCount = 0,        // new unconverted leads
  collectedAmt = 0,     // collections this month (Collections Officer)
}) {
  const pct = Math.min(targetPct, 100);

  if (role === 'Loan Officer') {
    const ob = Number(onboarded);
    const tgt = Number(onboardingTarget) || 60;
    const ratio = ob / tgt;

    if (ob === 0)
      return { msg: "Your dashboard is ready for action. Start with one onboarding and build momentum.", icon: '🚀' };
    if (ratio >= 1)
      return { msg: `Exceptional work — you've hit your onboarding target! Keep the momentum alive.`, icon: '🏆' };
    if (ratio >= 0.8)
      return { msg: `Excellent momentum — you're at ${Math.round(ratio * 100)}% of target. A strong finish is within reach.`, icon: '📈' };
    if (ratio >= 0.5)
      return { msg: `Solid progress — ${ob} onboarding${ob !== 1 ? 's' : ''} in. A few more will make this a great month.`, icon: '💪' };
    if (ratio >= 0.25)
      return { msg: `Nice start — keep engaging prospects daily. Consistency compounds quickly.`, icon: '⚡' };
    // low but > 0
    if (leadCount > 0)
      return { msg: `You have ${leadCount} lead${leadCount !== 1 ? 's' : ''} waiting. Convert them and you're on your way.`, icon: '🎯' };
    return { msg: "New day, new opportunities — every customer conversation counts.", icon: '🌟' };
  }

  if (role === 'Collections Officer') {
    if (collectedAmt === 0)
      return { msg: "Today is a fresh chance. Start the day with your highest-priority account.", icon: '🚀' };
    if (overdueCount === 0)
      return { msg: "Portfolio fully current — outstanding recovery performance!", icon: '🏆' };
    if (pct >= 90)
      return { msg: `Recovery at ${Math.round(pct)}% — exceptional discipline. Stay the course.`, icon: '📈' };
    if (pct >= 60)
      return { msg: `Strong recovery pace — ${Math.round(pct)}% in. Focus on the remaining accounts and close this month well.`, icon: '💪' };
    if (overdueCount > 0)
      return { msg: `${overdueCount} account${overdueCount !== 1 ? 's' : ''} still active — each contact today narrows the gap.`, icon: '⚡' };
    return { msg: "Every recovered shilling is a win. Keep building the streak.", icon: '🎯' };
  }

  // Generic / other roles
  if (pct >= 80) return { msg: "Strong performance — you're leading by example.", icon: '🏆' };
  if (pct >= 50) return { msg: "Steady progress — keep pushing towards your goals.", icon: '📈' };
  return { msg: "New day, new opportunities — make it count.", icon: '🌟' };
}

/* ─────────────────────────────────────────────
   Component
──────────────────────────────────────────────── */
export default function WorkerGreetingWidget({
  worker,
  // Loan Officer metrics
  onboarded = 0,
  onboardingTarget = 60,
  leadCount = 0,
  targetPct = 0,
  // Collections Officer metrics
  overdueCount = 0,
  collectedAmt = 0,
  // Shared
  isMobile = false,
  style = {},
}) {
  const [greeting, setGreeting] = useState(getGreeting);
  const [liveTime, setLiveTime] = useState(() => new Date());

  // Re-evaluate greeting every minute
  useEffect(() => {
    const id = setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Tick the clock very fast for milliseconds
  useEffect(() => {
    const id = setInterval(() => setLiveTime(new Date()), 50);
    return () => clearInterval(id);
  }, []);

  const name = firstName(worker?.name);
  const role = worker?.role || '';

  const { msg, icon: motIcon } = useMemo(() => buildMotivation({
    role, targetPct, onboarded, onboardingTarget, overdueCount, leadCount, collectedAmt
  }), [role, targetPct, onboarded, onboardingTarget, overdueCount, leadCount, collectedAmt]);

  // Role-aware accent colour
  const roleColor =
    role === 'Collections Officer' ? '#F59E0B' :
    role === 'Loan Officer'        ? T.accent :
    role === 'Finance'             ? '#10B981' :
    T.accent;

  return (
    <div style={{
      position: 'relative',
      borderRadius: 20,
      padding: isMobile ? '20px 20px' : '24px 32px',
      marginBottom: 24,
      overflow: 'hidden',
      background: `linear-gradient(135deg, ${roleColor}18 0%, ${T.card} 80%)`,
      border: `1px solid ${roleColor}30`,
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      flexWrap: 'wrap',
      ...style,
    }}>
      {/* Decorative blurred blob */}
      <div style={{
        position: 'absolute', top: -30, right: -30,
        width: 160, height: 160, borderRadius: '50%',
        background: `${roleColor}20`, filter: 'blur(50px)',
        pointerEvents: 'none',
      }} />

      {/* Greeting emoji badge */}
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: `${roleColor}20`,
        border: `1px solid ${roleColor}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, flexShrink: 0,
        boxShadow: `0 4px 16px ${roleColor}25`,
      }}>
        {greeting.emoji}
      </div>

      {/* Text block */}
      <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
        {/* Greeting line */}
        <div style={{
          fontSize: isMobile ? 20 : 26,
          fontWeight: 900,
          color: T.txt,
          letterSpacing: -0.5,
          lineHeight: 1.2,
        }}>
          {greeting.text}, <span style={{ color: roleColor }}>{name}</span>
        </div>

        {/* Motivation line */}
        <div style={{
          marginTop: 8,
          fontSize: isMobile ? 13 : 14,
          color: T.muted,
          fontWeight: 500,
          lineHeight: 1.5,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>{motIcon}</span>
          <span>{msg}</span>
        </div>
      </div>

      {/* Subtle time badge */}
      <div style={{
        flexShrink: 0,
        fontSize: 11,
        fontWeight: 700,
        color: roleColor,
        background: `${roleColor}15`,
        border: `1px solid ${roleColor}30`,
        borderRadius: 8,
        padding: '4px 10px',
        letterSpacing: 0.5,
        zIndex: 1,
        fontVariantNumeric: 'tabular-nums',
        display: 'flex',
        alignItems: 'baseline',
      }}>
        {liveTime.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        <span style={{ fontSize: '0.85em', opacity: 0.7, marginLeft: 2 }}>
          .{Math.floor(liveTime.getMilliseconds() / 10).toString().padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}
