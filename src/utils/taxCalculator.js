/**
 * Kenyan Statutory Tax Calculator (2024/2026 Rules)
 * 
 * Implements:
 * - NSSF: 6% capped at 2160
 * - SHIF: 2.75% flat
 * - Housing Levy (AHL): 1.5% flat
 * - PAYE: KRA Graduated Scale with 2400 relief
 */

export const calculateStatutoryDeductions = (grossPay) => {
  if (!grossPay || grossPay <= 0) {
    return { nssf: 0, shif: 0, ahl: 0, paye: 0, totalStatutory: 0 };
  }

  // 1. NSSF: 6% of Gross, capped at KES 2,160
  const nssf = Math.min(grossPay * 0.06, 2160);

  // 2. SHIF: 2.75% of Gross
  const shif = grossPay * 0.0275;

  // 3. Housing Levy (AHL): 1.5% of Gross
  const ahl = grossPay * 0.015;

  // 4. PAYE Calculation
  const taxableIncome = grossPay - nssf;
  let tax = 0;
  
  if (taxableIncome > 0) {
    let remaining = taxableIncome;
    
    // First 24,000 @ 10%
    const band1 = Math.min(remaining, 24000);
    tax += band1 * 0.10;
    remaining -= band1;

    // Next 8,333 (24,001 - 32,333) @ 25%
    if (remaining > 0) {
      const band2 = Math.min(remaining, 8333);
      tax += band2 * 0.25;
      remaining -= band2;
    }

    // Next 467,667 (32,334 - 500,000) @ 30%
    if (remaining > 0) {
      const band3 = Math.min(remaining, 467667);
      tax += band3 * 0.30;
      remaining -= band3;
    }

    // Next 300,000 (500,001 - 800,000) @ 32.5%
    if (remaining > 0) {
      const band4 = Math.min(remaining, 300000);
      tax += band4 * 0.325;
      remaining -= band4;
    }

    // Above 800,000 @ 35%
    if (remaining > 0) {
      tax += remaining * 0.35;
    }
  }

  // Apply Personal Relief (KES 2,400)
  const paye = Math.max(0, tax - 2400);

  return {
    nssf: Math.round(nssf),
    shif: Math.round(shif),
    ahl: Math.round(ahl),
    paye: Math.round(paye),
    totalStatutory: Math.round(nssf + shif + ahl + paye)
  };
};
