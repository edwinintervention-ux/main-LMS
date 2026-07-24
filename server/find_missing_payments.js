import fs from 'fs';
import { supabase } from './config/db.js';

// Simple CSV parser for our format
function parseCSV(content) {
    const lines = content.split('\n');
    const records = [];
    let isData = false;
    
    for (const line of lines) {
        if (!line.trim()) continue;
        const cols = line.split('","').map(c => c.replace(/^"|"$/g, ''));
        
        if (cols[0] === 'Receipt No.') {
            isData = true;
            continue;
        }
        
        if (isData && cols.length >= 13) {
            records.push({
                receipt: cols[0],
                time: cols[1],
                details: cols[3],
                status: cols[4],
                paidIn: cols[5].replace(/,/g, ''),
                account: cols[12]
            });
        }
    }
    return records;
}

async function findMissingAndPost() {
    try {
        const csvContent = fs.readFileSync('C:\\Users\\gkadi\\Downloads\\payments_export.csv', 'utf8');
        const transactions = parseCSV(csvContent);
        
        console.log(`Parsed ${transactions.length} transactions from CSV.`);
        
        const validTransactions = transactions.filter(t => t.account !== 'dep' && t.status === 'Completed' && parseFloat(t.paidIn) > 0);
        console.log(`Found ${validTransactions.length} valid transactions (excluding 'dep').`);
        
        const receipts = validTransactions.map(t => t.receipt);
        
        // Find which ones exist in the DB
        const { data: existingInDb, error } = await supabase
            .from('payments')
            .select('mpesa')
            .in('mpesa', receipts);
            
        if (error) throw error;
        
        const existingReceipts = new Set(existingInDb.map(p => p.mpesa));
        
        const missing = validTransactions.filter(t => !existingReceipts.has(t.receipt));
        
        console.log(`\nFound ${missing.length} missing valid transactions:`);
        missing.forEach(m => console.log(`- ${m.receipt}: KES ${m.paidIn} to Acc ${m.account}`));

        // For now, let's just log them out to verify.
        fs.writeFileSync('missing_transactions.json', JSON.stringify(missing, null, 2));

    } catch (err) {
        console.error(err);
    }
}

findMissingAndPost();
