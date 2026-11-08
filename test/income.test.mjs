import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,annualIncome,selectedMonthIncome,selectedAnnualIncome} from '../public/model.js';
const p={id:'a',name:'학교',rate:10000,start:'09:00',end:'10:00',break:0,schedule:{type:'weekly',days:[1],startDate:'2026-11-01',endDate:'2026-11-30'}};
const r=(date,place='a',rate=10000)=>({id:date+place,date,place,rate,start:'09:00',end:'10:00',break:0,note:''});
test('연간 근무지 선택: 같은 이름 합산, 일부·전체 해제, 수당 중복 없이 복원',()=>{
 const d={...emptyData(),places:[p,{...p,id:'b'},{...p,id:'c',name:'별도 학교'}],records:[r('2026-01-01'),r('2026-02-01','b'),r('2026-02-01','c',20000)],adjustments:{'2026-01':{allowance:100,deduction:0}}};
 assert.equal(selectedAnnualIncome(d,2026).net,40100);const selected=selectedAnnualIncome(d,2026,new Set(['학교']));assert.equal(selected.net,20000);assert.equal(selected.days,1);assert.equal(selected.allPlaces.length,2);assert.equal(selected.places.length,1);assert.equal(selected.allowance,0);
 assert.equal(selectedAnnualIncome(d,2026,new Set(['학교','별도 학교'])).net,0);assert.equal(selectedAnnualIncome(d,2026).net,40100);assert.equal(d.records.length,3);
});
test('연간 소득은 월별 반올림·수당·공제와 일치하며 다른 연도와 근무일정을 제외한다',()=>{
 const d={...emptyData(),places:[p,{...p,id:'b'}],records:[r('2026-01-01'),r('2026-01-01','b'),r('2026-11-02'),r('2025-12-31')],adjustments:{'2026-01':{allowance:500,deduction:100},'2026-06':{allowance:200,deduction:0},'2025-12':{allowance:999,deduction:0}}};
 const a=annualIncome(d,2026);assert.equal(a.net,30600);assert.equal(a.days,2);assert.equal(a.hours,3);assert.equal(a.months.length,12);assert.equal(a.months[10].base,10000);assert.equal(a.places.length,1);assert.equal(a.places[0].base,30000);assert.equal(a.net,a.months.reduce((s,m)=>s+m.net,0));
 assert.equal(annualIncome(d,2027).net,0);assert.throws(()=>annualIncome(d,1999));
 d.records=[{...r('2026-01-01'),end:'09:01',rate:100},{...r('2026-02-01'),end:'09:01',rate:100}];d.adjustments={};assert.equal(annualIncome(d,2026).base,4);
});
test('근무지 선택은 기본 전체이며 부분 선택 시 월 수당·공제를 제외하고 기록을 보존한다',()=>{
 const d={...emptyData(),places:[p,{...p,id:'b',rate:20000}],records:[r('2026-11-02'),r('2026-11-02','b',20000)],adjustments:{'2026-11':{allowance:1000,deduction:500}}};
 const copy=structuredClone(d),all=selectedMonthIncome(d,'2026-11');assert.equal(all.net,30500);assert.equal(all.forecast,150500);
 const a=selectedMonthIncome(d,'2026-11',new Set(['b']));assert.equal(a.net,10000);assert.equal(a.forecast,50000);assert.equal(a.records.length,1);assert.equal(a.partial,true);
 const none=selectedMonthIncome(d,'2026-11',new Set(['a','b']));assert.equal(none.net,0);assert.equal(none.forecast,0);assert.deepEqual(d,copy);
});
