/**
 * productCalculators.js
 * ─────────────────────
 * Standalone product calculators for Adequate Capital LMS.
 * Each product is fully isolated — changes here do NOT affect any other product.
 *
 * Swift30  → existing logic in lms-common.jsx (untouched)
 * Swift15  → everything defined here
 */

// ─── Swift15 Configuration ───────────────────────────────────────────────────

export const SWIFT15_CONFIG = {
  name: 'Swift15',
  label: 'Swift15 (15 Days)',
  durationDays: 15,
  interestRate: 0.16,       // 16% flat for 15 days
  minAmount: 2500,
  maxAmount: 15000,
  regFee: 500,              // KES 500 for new customers only
  supportedRepayTypes: ['Lump Sum', 'Daily', 'Weekly'],
};

// ─── Swift30 Configuration ───────────────────────────────────────────────────

export const SWIFT30_CONFIG = {
  name: 'Swift30',
  label: 'Swift30 (30 Days)',
  durationDays: 30,
  interestRate: 0.30,       // 30% flat for 30 days
  minAmount: 1000,
  maxAmount: Infinity,      // governed by customer credit limit
  regFee: 500,
  supportedRepayTypes: ['Lump Sum', 'Daily', 'Weekly', 'Biweekly', 'Monthly'],
};

// ─── FlexSure Configuration (Secured Collateral Facility) ────────────────────

export const FLEXSURE_CONFIG = {
  name: 'FlexSure',
  label: 'FlexSure (30 Days - Secured)',
  durationDays: 30,
  interestRate: 0.20,       // 20% flat for 30 days (collateral-backed rate)
  minAmount: 1000,
  maxLtvRatio: 0.30,        // Maximum loan is 30% of collateral market value
  regFee: 500,
  supportedRepayTypes: ['Lump Sum', 'Daily', 'Weekly', 'Biweekly', 'Monthly'],
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const PRODUCT_CONFIGS = {
  Swift15: SWIFT15_CONFIG,
  Swift30: SWIFT30_CONFIG,
  FlexSure: FLEXSURE_CONFIG,
};

/**
 * Returns the product config for a given product name.
 * Defaults to Swift30 for backward compatibility with existing loans.
 */
export const getProductConfig = (product) =>
  PRODUCT_CONFIGS[product] || SWIFT30_CONFIG;

// ─── Swift15 Helpers ─────────────────────────────────────────────────────────

/**
 * Returns the registration fee for a Swift15 loan.
 * @param {boolean} isRepeatBorrower  true = has previous paid loan → fee is 0
 * @returns {number} 500 or 0
 */
export const getSwift15RegFee = (isRepeatBorrower) =>
  isRepeatBorrower ? 0 : SWIFT15_CONFIG.regFee;

/**
 * Validates a Swift15 loan amount against product limits.
 * @param {number} amount
 * @returns {string|null} Error message, or null if valid
 */
export const validateSwift15Limits = (amount) => {
  const n = Number(amount);
  if (!n || n < SWIFT15_CONFIG.minAmount) {
    return `Minimum loan amount for Swift15 is KES ${SWIFT15_CONFIG.minAmount.toLocaleString()}`;
  }
  if (n > SWIFT15_CONFIG.maxAmount) {
    return `Maximum loan amount for Swift15 is KES ${SWIFT15_CONFIG.maxAmount.toLocaleString()}`;
  }
  return null;
};

/**
 * Calculates the repayment schedule for a Swift15 loan.
 *
 * Repayment types supported:
 *   Daily   → 15 equal daily installments
 *   Weekly  → 2 installments: Day 7 & Day 15
 *   Lump Sum → single payment on Day 15
 *
 * @param {number} principal   Loan principal (KES)
 * @param {string} repayFreq  'Daily' | 'Weekly' | 'Lump Sum'
 * @param {number} [regFee]   Registration fee (KES), default 0
 * @returns {{ period: string, amount: number }[]}
 */
export const calculateSwift15Schedule = (principal, repayFreq, regFee = 0) => {
  const p = Number(principal) || 0;
  const interest = Math.round(p * SWIFT15_CONFIG.interestRate);
  const total = p + interest + Number(regFee);

  if (!total) return [];

  if (repayFreq === 'Daily') {
    const d = SWIFT15_CONFIG.durationDays; // 15
    return [
      { period: 'Per Day', amount: Math.ceil(total / d) },
      { period: 'Per Week', amount: Math.ceil(total / d) * 7 },
      { period: 'Day 15 (Total)', amount: total },
    ];
  }

  if (repayFreq === 'Weekly') {
    // 2 equal installments: Day 7 and Day 15
    const installment = Math.ceil(total / 2);
    return [
      { period: 'Day 7 (Week 1)', amount: installment },
      { period: 'Day 15 (Week 2)', amount: total - installment },
    ];
  }

  if (repayFreq === 'Lump Sum') {
    return [{ period: 'Day 15 (One-time)', amount: total }];
  }

  return [];
};

/**
 * Computes interest, total, and summary display rows for a Swift15 loan.
 * @param {number} principal
 * @param {number} [regFee]
 * @param {number} [discountPct]  Customer discount percentage, e.g. 10 = 10%
 * @returns {{ interest, total, effectiveRate, rows }}
 */
export const getSwift15Summary = (principal, regFee = 0, discountPct = 0) => {
  const p = Number(principal) || 0;
  const effectiveRate = SWIFT15_CONFIG.interestRate * (1 - discountPct / 100);
  const interest = Math.round(p * effectiveRate);
  const total = p + interest;
  const rateLabel = discountPct > 0
    ? `Interest (${(SWIFT15_CONFIG.interestRate * 100 * (1 - discountPct / 100)).toFixed(1)}% flat)`
    : `Interest (${SWIFT15_CONFIG.interestRate * 100}% flat)`;

  return {
    interest,
    total,
    effectiveRate,
    rows: [
      ['Principal', p],
      [rateLabel, interest],
      ['Registration Fee', Number(regFee)],
      ['Total Repayable', total + Number(regFee)],
    ],
  };
};
