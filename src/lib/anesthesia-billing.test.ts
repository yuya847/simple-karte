import { it, expect } from 'vitest';
import { anesthesiaMasterCandidates } from './anesthesia-billing';
import { emptyAnesthesia, preopFromChart } from './anesthesia';
import { initialSurgeries } from './surgery';
it('マスターのコード・基本点数・時間加算を読む（2時間・1分超・31分超）',()=>{
  const s=initialSurgeries(600)[0];
  s.anesthesiaCase={...emptyAnesthesia(),completedAt:800,preop:{...preopFromChart(undefined,[],'麻酔科 青木'),method:'全身麻酔'},billingCategory:'4',difficult:false,management:'I',events:{'麻酔器接続':500,'麻酔器離脱':620}};
  let rows=anesthesiaMasterCandidates(s);
  expect(rows[0]).toMatchObject({code:'150333210',basePoints:6500,extraCount:0,points:6500});
  s.anesthesiaCase.events['麻酔器離脱']=621;rows=anesthesiaMasterCandidates(s);
  expect(rows[0]).toMatchObject({extraCount:1,extraPoints:650,points:7150});
  s.anesthesiaCase.events['麻酔器離脱']=651;rows=anesthesiaMasterCandidates(s);
  expect(rows[0]).toMatchObject({extraCount:2,extraPoints:1300,points:7800});
  expect(rows[1]).toMatchObject({code:'150279110',points:1050});
});
