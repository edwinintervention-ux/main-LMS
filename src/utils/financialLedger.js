import { calculateLoanStatus, BASE_INTEREST_RATE, getProductBaseRate, getProductDays, FREEZE_AFTER as GLOBAL_FREEZE_AFTER } from './../lms-common';

/**
 * Normalizes raw Supabase data into a strict chronological financial ledger.
 * 
 * ACCOUNTING PRINCIPLES ENFORCED:
 * 1. Debits increase the customer's balance (amount owed to the business).
 * 2. Credits decrease the customer's balance (amount paid to the business).
 * 3. Principal recovery is NOT revenue.
 * 4. All transactions must be strictly ordered by Date, then Type, then ID to ensure deterministic balances.
 */

export const TRANSACTION_TYPES = {
  DISBURSEMENT: 'Loan Disbursement',
  REG_FEE_CHARGED: 'Registration Fee Charged',
  REG_FEE_PAID: 'Registration Fee Paid',
  INTEREST_CHARGED: 'Interest Charged',
  PENALTY_CHARGED: 'Penalty Charged',
  PAYMENT_RECEIVED: 'Payment Received',
  PAYMENT_REVERSAL: 'Payment Reversal',
  WRITE_OFF: 'Loan Write-Off',
  ADJUSTMENT: 'Financial Adjustment'
};

/**
 * Transforms a single loan and its payments into an array of strict ledger transactions.
 */
export function normalizeLoanToTransactions(loan, payments = []) {
  const transactions = [];
  const customerId = loan.customerId || loan.customer_id;
  
  // Construct a full timestamp: use the official `disbursed` date, but inherit the exact time from `createdAt`
  let dsbDate = loan.disbursed || loan.createdAt || loan.created_at;
  const createdStr = loan.createdAt || loan.created_at;
  if (loan.disbursed && typeof loan.disbursed === 'string' && loan.disbursed.length === 10 && createdStr) {
    // Append the time portion of createdAt (e.g. "T14:32:07.123Z") to the disbursed date "YYYY-MM-DD"
    dsbDate = loan.disbursed + createdStr.substring(10);
  }

  const loanStatus = (loan.status || '').toLowerCase();
  const isNonDisbursedOrReversed = ['cancelled', 'reversed', 'rejected', 'declined', 'application submitted', 'worker-pending'].includes(loanStatus);

  // 1. Loan Disbursement (Debit)
  if (loan.disbursed && !isNonDisbursedOrReversed) {
    transactions.push({
      id: `TX-DSB-${loan.id}`,
      date: dsbDate,
      customerId,
      loanId: loan.id,
      type: TRANSACTION_TYPES.DISBURSEMENT,
      description: `Loan Disbursement - ${loan.id}`,
      ref: loan.mpesa || loan.id,
      debit: loan.amount || 0,
      credit: 0,
      components: { principal: loan.amount || 0, interest: 0, penalty: 0, fee: 0 },
      isRevenue: false,
      source: loan.customer || 'System'
    });

    // 2. Interest Charged (Debit)
    const effectiveRate = getProductBaseRate(loan.product) * (1 - (Number(loan.interestDiscount) || 0) / 100);
    const expectedInterest = (loan.amount || 0) * effectiveRate;
    
    if (expectedInterest > 0) {
      transactions.push({
        id: `TX-INT-${loan.id}`,
        date: dsbDate, 
        customerId,
        loanId: loan.id,
        type: TRANSACTION_TYPES.INTEREST_CHARGED,
        description: `Interest Charged - ${loan.id}`,
        ref: loan.id,
        debit: expectedInterest,
        credit: 0,
        components: { principal: 0, interest: expectedInterest, penalty: 0, fee: 0 },
        isRevenue: true,
        source: 'System'
      });
    }

    // 3. Registration Fee Charged (Debit) - if applicable
    if (loan.regFee > 0) {
       transactions.push({
        id: `TX-FEE-${loan.id}`,
        date: dsbDate,
        customerId,
        loanId: loan.id,
        type: TRANSACTION_TYPES.REG_FEE_CHARGED,
        description: `Registration Fee - ${loan.id}`,
        ref: loan.id,
        debit: loan.regFee,
        credit: 0,
        components: { principal: 0, interest: 0, penalty: 0, fee: loan.regFee },
        isRevenue: true,
        source: 'System'
      });
    }
  }

  // 4. Payments Received (Credit) and Refunds (Debit)
  const allocatedPayments = payments.filter(p => (p.loanId || p.loan_id) === loan.id && ['allocated', 'reversed', 'pending reversal', 'reversal failed'].includes((p.status || '').toLowerCase()));
  
  for (const pay of allocatedPayments) {
    const isRefund = Number(pay.amount) < 0;
    const isManualReversal = pay.type === 'Reversal' || (typeof pay.notes === 'string' && pay.notes.toLowerCase().includes('reversal') && !pay.notes.includes('REVERSAL INITIATED'));
    const description = isRefund
      ? `Refund to Customer${pay.notes ? ' - ' + pay.notes.split('.')[0] : ''}`
      : isManualReversal
      ? `${pay.notes ? pay.notes.split('.')[0] : 'M-Pesa Reversal'}`
      : `Payment Received - ${pay.method || 'M-Pesa'}`;
      
    transactions.push({
      id: `TX-PAY-${pay.id}`,
      date: pay.date || pay.created_at,
      customerId,
      loanId: loan.id,
      type: isRefund ? TRANSACTION_TYPES.PAYMENT_REVERSAL : isManualReversal ? TRANSACTION_TYPES.ADJUSTMENT : TRANSACTION_TYPES.PAYMENT_RECEIVED,
      description,
      ref: pay.receipt || pay.mpesa || pay.id,
      debit: isRefund ? Math.abs(pay.amount) : 0,
      credit: isRefund ? 0 : (pay.amount || 0),
      components: { 
        principal: pay.allocatedPrincipal || 0, 
        interest: pay.allocatedInterest || 0, 
        penalty: pay.allocatedPenalty || 0, 
        fee: pay.allocatedFee || 0 
      },
      isRevenue: false,
      source: pay.customer || pay.method || 'Unknown',
      customerName: pay.customer || null,
      method: pay.method || 'M-Pesa'
    });

    const payStatus = (pay.status || '').toLowerCase();
    if (payStatus === 'reversed' || payStatus === 'pending reversal') {
      transactions.push({
        id: `TX-REV-${pay.id}`,
        date: pay.updated_at || pay.updatedAt || pay.date || pay.created_at,
        customerId,
        loanId: loan.id,
        type: TRANSACTION_TYPES.PAYMENT_REVERSAL,
        description: payStatus === 'pending reversal' ? `Payment Reversal (Pending) - ${pay.method || 'M-Pesa'}` : `Payment Reversed - ${pay.method || 'M-Pesa'}`,
        ref: pay.receipt || pay.mpesa || pay.id,
        debit: pay.amount || 0,
        credit: 0,
        components: { principal: 0, interest: 0, penalty: 0, fee: 0 },
        isRevenue: false,
        source: 'System',
        customerName: pay.customer || null,
        method: pay.method || 'M-Pesa'
      });
    }
  }

  // 5. Penalties
  const paid = allocatedPayments.filter(p => (p.status || '').toLowerCase() === 'allocated').reduce((s, p) => s + p.amount, 0);
  const status = calculateLoanStatus(loan, null, paid);
  if (status.penalty > 0) {
      const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
      const disbursedMs = new Date(loan.disbursed || loan.createdAt);
      const eatDateStr = new Date(disbursedMs.getTime() + EAT_OFFSET_MS).toISOString().split('T')[0];
      
      const FREEZE_AFTER = GLOBAL_FREEZE_AFTER; // Max penalty days
      let od = Math.max(0, loan.daysOverdue || 0);
      if (loan.disbursed || loan.disbursed_at || loan.disbursedAt) {
        const dueDate = new Date(disbursedMs);
        dueDate.setDate(dueDate.getDate() + (loan.duration || getProductDays(loan.product)));
        const localDue = new Date(dueDate.getTime() - dueDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const localNow = new Date().toISOString().split('T')[0];
        const diffDays = Math.floor((new Date(localNow).getTime() - new Date(localDue).getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > od) od = diffDays;
      }
      const cappedOd = Math.max(1, Math.min(od, FREEZE_AFTER));
      
      const dailyPenalty = Math.floor((status.penalty / cappedOd) * 100) / 100;
      let accumulatedPenalty = 0;

      if (dailyPenalty < 1.00 || cappedOd <= 1) {
        // Consolidate micro-penalties into a single clean line item to prevent multi-page clutter
        const penaltyEatDate = new Date(eatDateStr);
        penaltyEatDate.setDate(penaltyEatDate.getDate() + (loan.duration || getProductDays(loan.product)) + 1);
        const penaltyDate = new Date(penaltyEatDate.getTime() - EAT_OFFSET_MS + 60 * 1000).toISOString();
        transactions.push({
          id: `TX-PEN-${loan.id}`,
          date: penaltyDate,
          customerId,
          loanId: loan.id,
          type: TRANSACTION_TYPES.PENALTY_CHARGED,
          description: `Penalty Accrued (${cappedOd}d overdue)`,
          ref: loan.id,
          debit: status.penalty,
          credit: 0,
          components: { principal: 0, interest: 0, penalty: status.penalty, fee: 0 },
          isRevenue: true,
          source: 'System'
        });
      } else {
        for (let i = 1; i <= cappedOd; i++) {
          const penaltyEatDate = new Date(eatDateStr);
          penaltyEatDate.setDate(penaltyEatDate.getDate() + (loan.duration || getProductDays(loan.product)) + i);
          const penaltyDate = new Date(penaltyEatDate.getTime() - EAT_OFFSET_MS + 60 * 1000).toISOString();
          
          let amount = dailyPenalty;
          if (i === cappedOd) amount = Number((status.penalty - accumulatedPenalty).toFixed(2));
          accumulatedPenalty += amount;

          transactions.push({
            id: `TX-PEN-${loan.id}-D${i}`,
            date: penaltyDate,
            customerId,
            loanId: loan.id,
            type: TRANSACTION_TYPES.PENALTY_CHARGED,
            description: `Penalty Accrued - Day ${i}`,
            ref: loan.id,
            debit: amount,
            credit: 0,
            components: { principal: 0, interest: 0, penalty: amount, fee: 0 },
            isRevenue: true,
            source: 'System'
          });
        }
      }
  }

  // 6. Write-Off (Credit to zero out balance)
  if (loanStatus === 'written off') {
    const totalDebits = transactions.reduce((sum, tx) => sum + tx.debit, 0);
    const totalCredits = transactions.reduce((sum, tx) => sum + tx.credit, 0);
    const unrecoveredBalance = Number((totalDebits - totalCredits).toFixed(2));

    if (unrecoveredBalance > 0) {
      const writeOffDate = loan.updatedAt || loan.updated_at || loan.createdAt || loan.created_at || new Date().toISOString();
      transactions.push({
        id: `TX-WO-${loan.id}`,
        date: writeOffDate,
        customerId,
        loanId: loan.id,
        type: TRANSACTION_TYPES.WRITE_OFF,
        description: `Loan Written Off (Unrecovered Balance)`,
        ref: loan.id,
        debit: 0,
        credit: unrecoveredBalance,
        components: { principal: 0, interest: 0, penalty: 0, fee: 0 },
        isRevenue: false,
        source: 'System'
      });
    }
  }

  return transactions;
}

/**
 * Generates a full chronological ledger for a customer across all their loans.
 */
export function generateCustomerLedger(customerLoans, allCustomerPayments) {
  let allTransactions = [];
  
  for (const loan of customerLoans) {
    const txs = normalizeLoanToTransactions(loan, allCustomerPayments);
    allTransactions = allTransactions.concat(txs);
  }

  const hasLoanRegFee = (customerLoans || []).some(l => Number(l.regFee || l.reg_fee || 0) > 0);

  // Handle unallocated payments (e.g. upfront Registration Fees without a loan)
  const unallocatedPayments = (allCustomerPayments || []).filter(p => !p.loanId && !p.loan_id && ['allocated', 'reversed', 'pending reversal', 'reversal failed'].includes((p.status || '').toLowerCase()));
  for (const pay of unallocatedPayments) {
    const isReg = pay.is_reg_fee || pay.isRegFee;
    const date = pay.date || pay.created_at;
    const customerId = pay.customerId || pay.customer_id;
    const amount = pay.amount || 0;
    
    // Only charge the fee (Debit) if NO loan already debited the registration fee
    if (isReg && amount > 0 && !hasLoanRegFee && (pay.status || '').toLowerCase() === 'allocated') {
      allTransactions.push({
        id: `TX-UFEE-${pay.id}`,
        date, customerId, loanId: null,
        type: TRANSACTION_TYPES.REG_FEE_CHARGED,
        description: `Registration Fee`,
        ref: pay.receipt || pay.id,
        debit: amount, credit: 0,
        components: { principal: 0, interest: 0, penalty: 0, fee: amount },
        isRevenue: true, source: 'System'
      });
    }

    // Add the actual payment (Credit)
    allTransactions.push({
      id: `TX-UPAY-${pay.id}`,
      date, customerId, loanId: null,
      type: isReg ? TRANSACTION_TYPES.REG_FEE_PAID : TRANSACTION_TYPES.PAYMENT_RECEIVED,
      description: isReg ? `Registration Fee Paid` : `Unallocated Payment - ${pay.method || 'M-Pesa'}`,
      ref: pay.receipt || pay.id,
      debit: amount < 0 ? Math.abs(amount) : 0,
      credit: amount > 0 ? amount : 0,
      components: { principal: 0, interest: 0, penalty: 0, fee: isReg ? amount : 0 },
      isRevenue: false, source: pay.customer || pay.method || 'Unknown',
      customerName: pay.customer || null, method: pay.method || 'M-Pesa'
    });

    const uPayStatus = (pay.status || '').toLowerCase();
    if (uPayStatus === 'reversed' || uPayStatus === 'pending reversal') {
      allTransactions.push({
        id: `TX-UREV-${pay.id}`,
        date: pay.updated_at || pay.updatedAt || date,
        customerId, loanId: null,
        type: TRANSACTION_TYPES.PAYMENT_REVERSAL,
        description: uPayStatus === 'pending reversal' ? `Payment Reversal (Pending) - ${pay.method || 'M-Pesa'}` : `Payment Reversed - ${pay.method || 'M-Pesa'}`,
        ref: pay.receipt || pay.id,
        debit: amount > 0 ? amount : 0,
        credit: amount < 0 ? Math.abs(amount) : 0,
        components: { principal: 0, interest: 0, penalty: 0, fee: 0 },
        isRevenue: false, source: 'System',
        customerName: pay.customer || null, method: pay.method || 'M-Pesa'
      });
    }
  }

  // Sort strictly: Date -> Type (Debits before Credits on same day) -> ID
  return allTransactions.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    
    // If same exact timestamp, process debits (charges) before credits (payments)
    if (a.debit > 0 && b.credit > 0) return -1;
    if (a.credit > 0 && b.debit > 0) return 1;

    // Fallback to ID for deterministic sorting
    return a.id.localeCompare(b.id);
  });
}

/**
 * Generates a full chronological ledger for the entire business (Adequate Capital).
 * This acts as the company's own bank statement (Money In vs Money Out).
 */
export function generateBusinessLedger(allLoans, allPayments) {
  let allTransactions = [];
  
  for (const loan of allLoans) {
    const txs = normalizeLoanToTransactions(loan, allPayments);
    
    for (const tx of txs) {
      // For the business statement, perspectives are flipped for actual cash flow:
      // A customer's Debit (Disbursement) is Money Out for the business.
      // A customer's Credit (Payment) is Money In for the business.
      // We ONLY care about actual cash movement (Disbursements and Payments).
      // We DO NOT care about accrued interest, penalties, or fees here, because they are not cash flow.
      
      if (tx.type === TRANSACTION_TYPES.DISBURSEMENT) {
        allTransactions.push({
          ...tx,
          moneyOut: tx.debit,
          moneyIn: 0
        });
      } else if (tx.type === TRANSACTION_TYPES.PAYMENT_RECEIVED || tx.type === TRANSACTION_TYPES.REG_FEE_PAID) {
        allTransactions.push({
          ...tx,
          moneyOut: 0,
          moneyIn: tx.credit
        });
      } else if (tx.type === TRANSACTION_TYPES.PAYMENT_REVERSAL) {
        allTransactions.push({
          ...tx,
          moneyOut: tx.debit,
          moneyIn: 0
        });
      }
    }
  }

  // Sort strictly: Date -> Type -> ID
  return allTransactions.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    
    // If same exact timestamp, process Money Out (Disbursements) before Money In (Payments)
    if (a.moneyOut > 0 && b.moneyIn > 0) return -1;
    if (a.moneyIn > 0 && b.moneyOut > 0) return 1;

    // Fallback to ID for deterministic sorting
    return a.id.localeCompare(b.id);
  });
}

/**
 * Calculates the opening balance of a ledger prior to a specific date.
 * Assumes the ledger is already chronologically sorted.
 */
export function calculateOpeningBalance(sortedLedger, fromDateStr) {
  if (!fromDateStr) return 0;
  
  // The fromDate must be evaluated at 00:00:00 of that day.
  // We sum all transactions that occurred strictly BEFORE this date.
  let openingBalance = 0;
  const fromTime = new Date(`${fromDateStr}T00:00:00`).getTime();

  for (const tx of sortedLedger) {
    const txTime = new Date(tx.date).getTime();
    if (txTime < fromTime) {
      openingBalance += (tx.debit - tx.credit);
    } else {
      // Since it's chronologically sorted, we can break early once we hit the fromDate
      break; 
    }
  }

  return openingBalance;
}

/**
 * Filters a chronologically sorted ledger to only include transactions within a date range.
 * Includes transactions from FromDate 00:00:00 through ToDate 23:59:59.
 */
export function filterLedgerByDate(sortedLedger, fromDateStr, toDateStr) {
  return sortedLedger.filter(tx => {
    const txTime = new Date(tx.date).getTime();
    
    let isAfterFrom = true;
    let isBeforeTo = true;

    if (fromDateStr) {
      const fromTime = new Date(`${fromDateStr}T00:00:00`).getTime();
      isAfterFrom = txTime >= fromTime;
    }

    if (toDateStr) {
      const toTime = new Date(`${toDateStr}T23:59:59.999`).getTime();
      isBeforeTo = txTime <= toTime;
    }

    return isAfterFrom && isBeforeTo;
  });
}

/**
 * Applies a running balance to a chronologically sorted ledger.
 */
export function applyRunningBalance(sortedLedger, openingBalance = 0) {
  let currentBalance = openingBalance;
  return sortedLedger.map(tx => {
    currentBalance = currentBalance + tx.debit - tx.credit;
    return {
      ...tx,
      runningBalance: currentBalance
    };
  });
}

/**
 * Calculates the opening balance of a business ledger prior to a specific date.
 * Treats the ledger as an Asset (Receivables) account: Disbursements increase balance, Payments decrease it.
 */
export function calculateBusinessOpeningBalance(sortedLedger, fromDateStr) {
  if (!fromDateStr) return 0;
  let openingBalance = 0;
  const fromTime = new Date(`${fromDateStr}T00:00:00`).getTime();

  for (const tx of sortedLedger) {
    const txTime = new Date(tx.date).getTime();
    if (txTime < fromTime) {
      // Disbursements (Money Out) increase the receivables balance
      // Payments (Money In) decrease the receivables balance
      openingBalance += (tx.moneyOut - tx.moneyIn);
    } else {
      break; 
    }
  }
  return openingBalance;
}

/**
 * Applies a running balance to a chronologically sorted business ledger.
 * Treats the ledger as an Asset (Receivables) account.
 */
export function applyBusinessRunningBalance(sortedLedger, openingBalance = 0) {
  let currentBalance = openingBalance;
  return sortedLedger.map(tx => {
    currentBalance = currentBalance + tx.moneyOut - tx.moneyIn;
    return {
      ...tx,
      runningBalance: currentBalance
    };
  });
}

