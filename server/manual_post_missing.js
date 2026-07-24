import fs from 'fs';
import { supabase } from './config/db.js';

async function manualPostMissingPayments() {
    try {
        const rawData = fs.readFileSync('missing_transactions.json', 'utf8');
        const missing = JSON.parse(rawData);
        
        console.log(`Manually posting ${missing.length} missing payments...`);
        
        for (const m of missing) {
            console.log(`\n--- Posting ${m.receipt} (KES ${m.paidIn} -> Ref ${m.account}) ---`);
            const amount = parseFloat(m.paidIn);
            
            // 1. Find customer by Account/ID
            const { data: custData, error: custErr } = await supabase
                .from('customers')
                .select('id, name')
                .or(`account_number.eq.${m.account},id_number.eq.${m.account}`)
                .maybeSingle();
                
            let customerId = null;
            let customerName = m.details;
            
            if (custData) {
                customerId = custData.id;
                customerName = custData.name;
                console.log(`Matched customer: ${customerName} (${customerId})`);
            } else {
                console.log(`WARNING: Could not find customer for Ref ${m.account}. Will insert as unallocated if possible, or just fail.`);
                continue; // Skip if we can't find the customer, we want to post the ones with "correct details"
            }
            
            // 2. Find active loan
            const { data: loanData } = await supabase
                .from('loans')
                .select('id, balance, status')
                .eq('customer_id', customerId)
                .eq('status', 'Active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
                
            let loanId = null;
            let newBalance = 0;
            let newStatus = 'Active';
            
            if (loanData) {
                loanId = loanData.id;
                newBalance = parseFloat(loanData.balance) - amount;
                if (newBalance <= 0) {
                    newStatus = 'Completed';
                }
                console.log(`Found active loan: ${loanId}. Balance: ${loanData.balance} -> ${newBalance} (${newStatus})`);
            } else {
                console.log(`No active loan found for customer. Payment will be recorded without a loan_id.`);
            }
            
            // 3. Insert into payments
            const { error: insErr } = await supabase.from('payments').insert([{
                customer_id: customerId,
                customer_name: customerName,
                loan_id: loanId,
                amount: amount,
                mpesa: m.receipt,
                date: new Date().toISOString().split('T')[0],
                notes: `Manually recovered from missing CSV. Ref: ${m.account}`
            }]);
            
            if (insErr) {
                console.error(`Failed to insert payment ${m.receipt}:`, insErr.message);
                continue;
            }
            
            // 4. Update loan if applicable
            if (loanId) {
                const { error: updErr } = await supabase.from('loans')
                    .update({ balance: newBalance, status: newStatus })
                    .eq('id', loanId);
                    
                if (updErr) {
                    console.error(`Failed to update loan ${loanId}:`, updErr.message);
                } else {
                    console.log(`Successfully updated loan ${loanId}`);
                }
            }
            
            // 5. Audit Log
            await supabase.from('audit_log').insert([{
                user_name: 'System Recovery',
                action: 'Manual Payment Recovery',
                target_id: customerId,
                detail: `Recovered missing payment ${m.receipt} of KES ${amount} for ${customerName}. ${loanId ? `Applied to loan ${loanId}, new balance KES ${newBalance}.` : 'No active loan.'}`
            }]);
            
            console.log(`✅ Successfully posted ${m.receipt}.`);
        }
        
    } catch (err) {
        console.error("Script error:", err);
    }
}

manualPostMissingPayments();
