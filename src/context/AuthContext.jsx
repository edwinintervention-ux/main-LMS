import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, DEMO_MODE } from '@/config/supabaseClient';

// ── Demo mode stub — only used when SUPABASE is missing ──────────────────────
const DEMO_USER = null;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session,  setSession]  = useState(null);
  const [worker,   setWorker]   = useState(null);   // row from workers table
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // ── Load worker profile from workers table ──────────────────
  // Matches by auth_user_id first, falls back to email.
  // Also backfills auth_user_id on the row if it was missing,
  // so future lookups are fast and RLS auth.uid() checks work.
  const loadWorker = useCallback(async (userId, userEmail) => {
    if (!supabase) return;

    // Using maybeSingle() instead of single() to avoid 406 errors if the worker is not found
    let { data, error } = await supabase
      .from('workers')
      .select('*')
      .or(`auth_user_id.eq.${userId},email.ilike."${userEmail}"`)
      .maybeSingle();

    if (error) {
      console.error('[AuthContext] loadWorker Error:', error.message);
      return;
    }

    if (!data && userEmail !== 'admin@adequatecapital.co.ke') {
      console.warn('[AuthContext] No worker profile found for:', userEmail);
    } else if (data) {
      // ── Security: Force-sign-out deactivated / suspended accounts ──────────
      // The Supabase Auth session stays valid even after admin deactivates the
      // worker record. We must revoke it here at the app layer.
      if (data.status && data.status !== 'Active') {
        console.warn(`[AuthContext] Account deactivated (${data.status}). Signing out: ${data.email}`);
        await supabase.auth.signOut();
        setWorker(null);
        return;
      }

      // Backfill auth_user_id (Fire-and-forget to avoid blocking the UI)
      if (!data.auth_user_id) {
        supabase.from('workers').update({ auth_user_id: userId }).eq('id', data.id).then(({error}) => {
          if (!error) console.log(`[AuthContext] Successfully backfilled auth_user_id for: ${data.name}`);
        });
        data.auth_user_id = userId;
      }
    }

    setWorker(data);
  }, []);

  // ── Initialise ──────────────────────────────────────────────
  useEffect(() => {
    /*
    if (DEMO_MODE) {
      // No Supabase — start in demo mode, not logged in
      setLoading(false);
      return;
    }
    */

    // Parallelise session resolution and worker profile loading
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        // Start loading worker but don't block the initial 'loading' state
        // if we can get to the hydro-sync screen faster.
        loadWorker(session.user.id, session.user.email).finally(() => {
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        loadWorker(session.user.id, session.user.email);
        
        // Auto-trigger balance sync on login for financial visibility
        if (event === 'SIGNED_IN') {
           import('@/utils/mpesa').then(({ checkAccountBalance }) => {
             checkAccountBalance().catch(e => console.warn('[Auth] Background balance sync failed:', e.message));
           });
        }
      } else {
        setWorker(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadWorker]);

  // ── Auth actions ────────────────────────────────────────────
  const signIn = useCallback(async (email, password) => {
    setError(null);

    // Demo mode: Blocked for security. Use legitimate credentials.
    /*
    if (DEMO_MODE) {
      return { error: { message: 'Authentication disabled in Demo Mode. Connect Supabase to proceed.' } };
    }
    */

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    // if (DEMO_MODE) { setSession(null); setWorker(null); return; }
    await supabase.auth.signOut();
  }, []);

  // ── Derived ─────────────────────────────────────────────────
  const isAuthenticated = !!session;
  const role = worker?.role ?? null;

  const can = useCallback((action) => {
    if (!role) return false;
    const PERMS = {
      Admin:                ['read','write','delete','approve','disburse','blacklist','report','settings'],
      'Loan Officer':       ['read','write','approve'],
      'Collections Officer':['read','write'],
      Finance:              ['read','write','report'],
      'Viewer / Auditor':   ['read','report'],
    };
    return (PERMS[role] || []).includes(action);
  }, [role]);

  const refreshWorker = useCallback(async () => {
    if (session?.user) await loadWorker(session.user.id, session.user.email);
  }, [session, loadWorker]);

  const value = {
    session, worker, role, loading, error,
    isAuthenticated,
    can,
    signIn, signOut,
    refreshWorker,
    supabase, // Exporting supabase instance too
    DEMO_MODE,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}