DO $$
DECLARE
    v_customer_id TEXT;
    v_loan_id TEXT;
BEGIN
    v_customer_id := 'CUST-' || lpad(floor(random() * 1000000)::text, 6, '0');
    v_loan_id := 'LOAN-' || lpad(floor(random() * 1000000)::text, 6, '0');

    INSERT INTO public.customers (
        id, name, phone, id_no, status, created_at
    ) VALUES (
        v_customer_id, 'Test Customer', '254714256816', '29590263', 'Active', NOW()
    );

    INSERT INTO public.loans (
        id, customer_id, amount, officer, status, disbursed, created_at, repayment_type
    ) VALUES (
        v_loan_id, v_customer_id, 5000, 'System', 'Active', (NOW() - INTERVAL '15 days'), NOW(), 'Monthly'
    );
END
$$;