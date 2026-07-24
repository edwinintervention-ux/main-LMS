import fs from 'fs';
import { supabase } from './config/db.js';
import { processC2BConfirmation } from './modules/payments/payments.service.js';

async function processMissingPayments() {
    try {
        const rawData = fs.readFileSync('missing_transactions.json', 'utf8');
        const missing = JSON.parse(rawData);
        
        console.log(`Processing ${missing.length} missing payments...`);
        
        for (const m of missing) {
            console.log(`\n--- Processing ${m.receipt} (KES ${m.paidIn} -> Acc ${m.account}) ---`);
            
            // Reconstruct payload from details (e.g. "Pay Bill from 25479****166 - Margaret **** Kahihia Acc. 12474511")
            // Safaricom time format: YYYYMMDDHHmmss
            const timeParts = m.time.split(' ');
            const dMy = timeParts[0].split('-');
            const hms = timeParts[1].replace(/:/g, '');
            const safTime = `${dMy[2]}${dMy[1]}${dMy[0]}${hms}`;
            
            // Try to extract phone and name from details
            let phone = '';
            let firstName = 'Unknown';
            let lastName = '';
            
            const match = m.details.match(/from ([\d\*]+) - (.*?) Acc/i);
            if (match) {
                phone = match[1];
                const nameParts = match[2].trim().split(' ');
                firstName = nameParts[0];
                if (nameParts.length > 1) {
                    lastName = nameParts[nameParts.length - 1];
                }
            }

            const payload = {
                TransID: m.receipt,
                TransTime: safTime,
                TransAmount: parseFloat(m.paidIn),
                BusinessShortCode: '4166191',
                BillRefNumber: m.account,
                MSISDN: phone,
                FirstName: firstName,
                LastName: lastName
            };
            
            console.log("Constructed payload:", payload);
            
            try {
                const result = await processC2BConfirmation(payload);
                console.log(`Result for ${m.receipt}:`, result);
            } catch (err) {
                console.error(`Failed to process ${m.receipt}:`, err.message);
            }
        }
        
        console.log('\n--- Done processing missing payments ---');
        
    } catch (err) {
        console.error(err);
    }
}

processMissingPayments();
