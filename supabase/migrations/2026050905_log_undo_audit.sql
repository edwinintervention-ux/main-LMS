-- ================================================================
-- MIGRATION: Log Undo Action in Audit Trail
-- Goal: Ensure the manual reversal is visible to the user in the Audit Ledger.
-- ================================================================

INSERT INTO public.audit_log (
    user_name,
    action,
    target_id,
    detail
) VALUES (
    'Antigravity (AI)',
    'Manual Payment Allocation Reverted',
    'PAY-8323838C',
    'Undo allocation of KSh 1 payment for Donald Barare Osiemo to verify system fixes.'
);
