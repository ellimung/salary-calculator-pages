import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {parseHolidayPage,createHolidayService} from '../holiday-service.mjs';
import {emptyData,validateData,scheduledOn,excludeWorkDate} from '../public/model.js';
import {holidayEntries,holidayName,setHolidayYear} from '../public/holidays.js';
const p={id:'p1',name:'학교',location:'교실',rate:10000,start:'09:00',end:'17:00',break:60,schedule:{type:'weekly',startDate:'2026-01-01',endDate:'',days:[0,1,2,3,4,5,6]}};
function page(year,extra=''){
 const rows=Object.entries(holidayEntries(2027)).map(([date,name])=>`<tr><td>${name}</td><td>${Number(date.slice(0,2))}월 ${Number(date.slice(3))}일<br>(월)</td><td></td><td></td></tr>`).join('');
 return `<h2>${year}년 달력자료</h2><h2>국경일과 공휴일</h2><table>${rows}${extra}</table><h2>기념일</h2><table><tr><td>어버이날</td><td>5월 8일</td></tr></table>`;
}
test('공휴일 쉬기, 대체공휴일, 추가 휴무 및 실제 기록 유지',()=>{
 for(const date of ['2026-03-02','2026-05-01','2026-05-25','2026-06-03','2026-07-17','2026-08-17','2027-02-09','2027-07-19']){assert.equal(scheduledOn(p,date),true);assert.equal(scheduledOn({...p,skipHolidays:true},date),false);}
 assert.equal(scheduledOn({...p,skipHolidays:true},'2026-11-09'),true);
 const r={id:'r1',place:'p1',date:'2026-05-05',start:p.start,end:p.end,break:p.break,rate:p.rate,note:''};
 const v=validateData({...emptyData(),places:[{...p,skipHolidays:true,extraDaysOff:['2028-01-05']}],records:[r]});
 assert.equal(v.places[0].skipHolidays,true);assert.equal(v.records.length,1);assert.equal(scheduledOn(v.places[0],'2028-01-05'),false);assert.equal(scheduledOn({...p,extraDaysOff:['2028-01-05']},'2028-01-05'),false);
 for(const invalid of [{skipHolidays:'true'},{extraDaysOff:['2028-02-30']},{extraDaysOff:['2028-01-05','2028-01-05']}])assert.throws(()=>validateData({...emptyData(),places:[{...p,...invalid}]}));
});
test('휴일 표만 파싱: 연휴 범위, 대체·임시 공휴일, 잘못된 자료 거부',()=>{
 const html=page(2027,'<tr><td>추석</td><td>9월 14일~9월 16일</td><td>임시공휴일</td><td>11월 12일</td></tr>');
 const days=parseHolidayPage(html,2027);assert.equal(days['09-16'],'추석');assert.equal(days['11-12'],'임시공휴일');assert.equal(days['05-08'],undefined);
 assert.throws(()=>parseHolidayPage(html,2028));assert.throws(()=>parseHolidayPage('<h2>2027년 달력자료</h2>',2027));assert.throws(()=>parseHolidayPage(html.replace('1월 1일','2월 30일'),2027));
 setHolidayYear(2028,days);assert.equal(holidayName('2028-11-12'),'임시공휴일');assert.equal(scheduledOn({...p,skipHolidays:true},'2028-11-12'),false);
 assert.throws(()=>setHolidayYear(2028,{'02-30':'오류'}));
});
test('자동 갱신, 요청 합치기, 실패 시 캐시 유지와 서버 재시작 복원',async()=>{
 const parent=path.resolve('test-results');mkdirSync(parent,{recursive:true});const dir=mkdtempSync(path.join(parent,'holidays-'));
 let now=Date.parse('2026-11-08T00:00:00Z'),calls=0,fail=false,added=false;
 const fetcher=async()=>{calls++;await new Promise(r=>setTimeout(r,5));if(fail)throw Error('offline');return new Response(page(2027,added?'<tr><td>임시공휴일</td><td>11월 12일</td><td></td><td></td></tr>':''));};
 try{
  const service=createHolidayService({dataDir:dir,fetcher,now:()=>now});
  const [a,b]=await Promise.all([service.get(2027),service.get(2027)]);assert.equal(calls,1);assert.equal(a.checkedAt,b.checkedAt);assert.equal(a.error,null);
  await service.get(2027);assert.equal(calls,1);now+=3600001;await service.get(2027);assert.equal(calls,1);
  await service.get(2027,{force:true});assert.equal(calls,2);
  now+=86400001;added=true;const fresh=await service.get(2027);assert.equal(fresh.days['11-12'],'임시공휴일');assert.equal(calls,3);
  now+=86400001;fail=true;const stale=await service.get(2027);assert.ok(stale.error);assert.equal(stale.checkedAt,fresh.checkedAt);assert.equal(stale.days['11-12'],'임시공휴일');
  const manual=await service.get(2027,{force:true});assert.equal(calls,5);assert.ok(manual.error);const restored=await createHolidayService({dataDir:dir,fetcher,now:()=>now}).get(2027);assert.equal(restored.days['11-12'],'임시공휴일');assert.ok(restored.error);
  const unsupported=await service.get(2099);assert.equal(unsupported.available,false);assert.ok(unsupported.error);
 }finally{assert.ok(path.resolve(dir).startsWith(parent+path.sep));rmSync(dir,{recursive:true,force:true});}
});
test('반복 근무의 특정 날짜만 삭제하고 백업으로 유지',()=>{
 const excluded=excludeWorkDate(p,'2026-11-09');
 assert.equal(scheduledOn(excluded,'2026-11-09'),false);assert.equal(scheduledOn(excluded,'2026-11-16'),true);
 assert.equal(scheduledOn(p,'2026-11-09'),true);assert.deepEqual(excludeWorkDate(excluded,'2026-11-09').extraDaysOff,['2026-11-09']);
 const restored=validateData({...emptyData(),places:[excluded]});assert.equal(scheduledOn(restored.places[0],'2026-11-09'),false);
 assert.throws(()=>excludeWorkDate(p,'2026-02-30'));
});
