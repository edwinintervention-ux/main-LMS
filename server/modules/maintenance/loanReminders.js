import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PAYBILL = '4166191';

async function generateMessage(loanId, customerId, type, includeTag = true) {
    const { data: loan } = await supabase.from('loans').select('*, customers(id_no, account_number, id_number)').eq('id', loanId).single();
    if (!loan) return null;

    const baseTotal = loan.amount * (1 + 0.3 * (1 - (loan.interest_discount || 0) / 100.0));
    const penalty = loan.penalty_accrued || 0;
    
    const { data: payments } = await supabase.from('payments').select('amount').eq('loan_id', loanId).eq('status', 'Allocated');
    const totalPaid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;

    const liveBalance = Math.max(0, baseTotal + penalty - totalPaid);
    if (liveBalance <= 0) return 'PAID';

    const acctRef = loan.customers?.account_number || loan.customers?.id_no || loan.customers?.id_number || customerId;
    const formattedBalance = liveBalance.toLocaleString('en-KE');

    let finalMessage = '';
    if (type === '7_days_before') {
        finalMessage = `Dear Customer, your loan will be due in 7 days. Remaining balance is KES ${formattedBalance}. Pay via Paybill ${PAYBILL}, Account: ${acctRef}.`;
    } else if (type === 'on_due_date') {
        finalMessage = `Dear Customer, your loan is due today. Remaining balance is KES ${formattedBalance}. Pay via Paybill ${PAYBILL}, Account: ${acctRef}.`;
    }

    if (includeTag) {
        finalMessage += ` [Ref: ${type}]`;
    }
    
    return finalMessage;
}

export async function queueUpcomingReminders() {
    console.log('[Loan Reminders] Running queueing process...');
    
    const { data: loans, error } = await supabase
        .from('loans')
        .select('id, customer_id, disbursed, status')
        .in('status', ['Active', 'Overdue']);

    if (error) {
        console.error('[Loan Reminders] Error fetching loans:', error.message);
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const loan of loans) {
        if (!loan.disbursed) continue;

        const disbursedDate = new Date(loan.disbursed);
        const dueDate = new Date(disbursedDate);
        dueDate.setDate(dueDate.getDate() + 30);
        dueDate.setHours(7, 0, 0, 0);

        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

        if (daysUntilDue === 10) {
            const sendAt = new Date(dueDate);
            sendAt.setDate(sendAt.getDate() - 7);
            await insertDynamicQueue(loan.customer_id, loan.id, '7_days_before', sendAt);
        }

        if (daysUntilDue === 3) {
            await insertDynamicQueue(loan.customer_id, loan.id, 'on_due_date', dueDate);
        }
    }
}

async function insertDynamicQueue(customerId, loanId, type, sendAt) {
    const msgPayload = await generateMessage(loanId, customerId, type, true);
    if (!msgPayload || msgPayload === 'PAID') return;

    // Check if already queued for this exact date
    const { data: existing } = await supabase
        .from('queued_sms')
        .select('id')
        .eq('loan_id', loanId)
        .like('message', `%[Ref: ${type}]%`)
        .single();

    if (!existing) {
        await supabase.from('queued_sms').insert({
            customer_id: customerId,
            loan_id: loanId,
            message: msgPayload,
            send_at: sendAt.toISOString(),
            status: 'queued'
        });
        console.log(`[Loan Reminders] Queued ${type} reminder for loan ${loanId}`);
    }
}

export async function resolveDynamicReminders() {
    console.log('[Loan Reminders] Resolving dynamic balances...');

    const lookahead = new Date();
    lookahead.setHours(lookahead.getHours() + 2);

    const { data: msgs, error } = await supabase
        .from('queued_sms')
        .select('id, customer_id, loan_id, message, send_at')
        .eq('status', 'queued')
        .like('message', '%[Ref: %]')
        .lte('send_at', lookahead.toISOString());

    if (error) {
        console.error('[Loan Reminders] Error fetching queued sms:', error.message);
        return;
    }

    for (const msg of msgs) {
        // Extract type from tag e.g. [Ref: 7_days_before]
        const match = msg.message.match(/\[Ref:\s*(.*?)\]/);
        if (!match) continue;
        const type = match[1];

        const finalMessage = await generateMessage(msg.loan_id, msg.customer_id, type, false);
        
        if (!finalMessage || finalMessage === 'PAID') {
            await supabase.from('queued_sms').update({ status: 'cancelled' }).eq('id', msg.id);
            continue;
        }

        await supabase.from('queued_sms').update({ message: finalMessage }).eq('id', msg.id);
        console.log(`[Loan Reminders] Resolved msg ${msg.id} with fresh balance`);
    }
}
