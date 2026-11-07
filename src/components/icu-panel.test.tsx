import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {IcuPanel,type IcuPanelProps} from './IcuPanel';
import {emptyIcuRecords} from '@/lib/icu/types';
import {icuFixture,icuPatient} from '@/lib/icu/test-fixture';
const props:IcuPanelProps={patient:icuPatient,records:icuFixture(),onChange:()=>{},role:'医師',me:{role:'医師',name:'架空医師'},today:{y:2026,m:11,d:7},nowTime:'10:00',deny:()=>null,auditLog:()=>{},newId:()=> 'new'};
it('時間表にγ・mL/h・呼吸器・24時間尿量と累積',()=>{const html=renderToStaticMarkup(<IcuPanel {...props}/>);expect(html).toContain('0.12γ');expect(html).toContain('4.9mL/h');expect(html).toContain('A/C-PC');expect(html).toContain('尿量');expect(html).toContain('入室から累積');});
it('SOFAの合計とラインの3日目',()=>{const sofa=renderToStaticMarkup(<IcuPanel {...props} initialTab="SOFA"/>);expect(sofa).toContain('合計');expect(sofa).toContain('<b>4</b>');expect(sofa).toContain('ノルアドレナリン');expect(renderToStaticMarkup(<IcuPanel {...props} initialTab="ライン・チューブ"/>)).toContain('3日目');});
it('他病棟・空記録でも全タブを開ける',()=>{for(const tab of ['時間表','呼吸器・血液ガス','持続投与','ライン・チューブ','SOFA','回診'] as const)expect(()=>renderToStaticMarkup(<IcuPanel {...props} records={emptyIcuRecords()} patient={{...icuPatient,ward:'5階東'}} initialTab={tab}/>)).not.toThrow();});

it('持続投与があっても未記録の尿量を0と表示しない',()=>{const r=icuFixture();r.hourly=r.hourly.slice(0,1);r.hourly[0].at.time='00:30';const html=renderToStaticMarkup(<IcuPanel {...props} records={r}/>);const urine=html.match(/>尿量<\/th>([\s\S]*?)<\/tr>/)![1];expect((urine.match(/>—<\/button>/g)??[]).length).toBe(23);expect(urine).toContain('>30</button>');});
