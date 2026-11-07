import {it,expect} from 'vitest';
import {lineDays} from './lines';
import {icuFixture} from './test-fixture';
it('挿入日を1日目、抜去済み・未来',()=>{const l=icuFixture().lines[0];expect(lineDays(l,-2)).toBe('1日目');expect(lineDays(l,0)).toBe('3日目');expect(lineDays({...l,removedAt:{day:-1,time:'09:00'}},0)).toBe('抜去（2 日間）');expect(lineDays(l,-3)).toBe('未挿入');});
