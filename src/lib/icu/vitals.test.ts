import {it,expect} from 'vitest';
import {mapOf,mapWithMeasured} from './vitals';
it('MAP 式と実測優先',()=>{expect(mapOf(120,60)).toBe(80);expect(mapOf(100,60)).toBe(73);expect(mapOf(undefined,60)).toBeNull();expect(mapWithMeasured({map:68},120,60)).toBe(68);});
