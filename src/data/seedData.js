// Auto-extracted seed data from lms-v1_8_2.jsx
// Used in DEMO_MODE when no Supabase credentials are configured

const _hashPw = (pw) => { try{ const s=(pw||'')+':acl2024'; let h=0; for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i);h|=0;} return Math.abs(h).toString(36)+s.length.toString(36); }catch(e){ return pw||''; } };
const _checkPw = (raw, stored) => { try{ return _hashPw(raw) === stored; }catch(e){ return false; } };

const SEED_WORKERS = [];
const SEED_CUSTOMERS = [];
const SEED_LOANS = [];
const SEED_PAYMENTS = [];
const SEED_LEADS = [];
const SEED_INTERACTIONS = [];
const SEED_AUDIT = [];

export {
  _hashPw,
  _checkPw,
  SEED_WORKERS,
  SEED_CUSTOMERS,
  SEED_LOANS,
  SEED_PAYMENTS,
  SEED_LEADS,
  SEED_INTERACTIONS,
  SEED_AUDIT,
};
