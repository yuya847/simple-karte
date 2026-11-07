import { expect, it } from 'vitest';
import { LACTATE_MG_PER_MMOL, LACTATE_HINT, mgPerDlToMmolPerL } from './lactate';
it('乳酸mg/dLをモル質量からmmol/Lへ換算する',()=>{
 expect(LACTATE_MG_PER_MMOL).toBe(9.008);
 expect(mgPerDlToMmolPerL(56)).toBe(6.2);
 expect(mgPerDlToMmolPerL(0)).toBe(0);
 expect(LACTATE_HINT).toContain('mg/dL');
});
