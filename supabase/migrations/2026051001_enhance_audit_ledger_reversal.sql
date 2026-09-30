-- Migration: Enhance Unified Audit Ledger for Reversal Trail
-- 1. Update view to include notes for disbursements (via result_desc)
-- 2. Include reversal_id for better traceability

CREATE OR REPLACE VIEW public.unified_audit_ledger AS
SELECT 
    CASE 
      WHEN p.status = 'Reversed' THEN 'reversal'
      WHEN p.amount < 0 THEN 'transfer'
      WHEN p.is_reg_fee THEN 'reg_fee'
      WHEN p.notes ILIKE '%transfer%' THEN 'transfer'
      ELSE 'payment'
    END as tx_type,
    p.id,
    p.created_at,
    p.customer_name,
    p.amount,
    p.mpesa as reference,
    p.status,
    p.is_reg_fee,
    p.loan_id,
    p.notes,
    p.reversal_id
FROM public.payments p
UNION ALL
SELECT 
    CASE 
      WHEN d.status = 'Reversed' THEN 'reversal'
      ELSE 'disbursement'
    END as tx_type,
    d.id::text,
    d.created_at,
    c.name as customer_name,
    d.amount,
    d.transaction_id as reference,
    d.status,
    false as is_reg_fee,
    d.loan_id,
    d.result_desc as notes,
    d.reversal_id
FROM public.b2c_disbursements d
LEFT JOIN public.customers c ON d.customer_id = c.id;

GRANT SELECT ON public.unified_audit_ledger TO authenticated;
GRANT SELECT ON public.unified_audit_ledger TO service_role;

NOTIFY pgrst, 'reload schema';
