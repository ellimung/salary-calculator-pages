import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,validateData,validateSchedule,scheduledOn,plannedPlaces,monthForecastPay,cancelAttendance} from '../public/model.js';
const place={id:'school',name:'학교',location:'교실',rate:18000,start:'09:00',end:'17:00',break:60};
test('잘못 누른 출근 취소는 실제 기록만 제거하고 반복 일정·다른 기록을 유지한다',()=>{
 const p={...place,schedule:{type:'monthly',day:12,startDate:'2026-01-01',endDate:''}},record={id:'today',date:'2026-11-12',place:p.id,start:'09:00',end:'16:00',break:60,rate:18000,note:''},other={...record,id:'prior',date:'2026-10-12'};
 const original={...emptyData(),places:[p],records:[record,other]},snapshot=structuredClone(original),result=cancelAttendance(original,'today');
 assert.deepEqual(result.records,[other]);assert.deepEqual(result.places,original.places);assert.deepEqual(original,snapshot);assert.equal(plannedPlaces(result,'2026-11-12').length,1);assert.equal(monthForecastPay(result,'2026-11'),126000);assert.throws(()=>cancelAttendance(result,'missing'));
});
test('월 1회 반복: 같은 날짜, 없는 날짜 건너뛰기, 기간·윤년·공휴일·백업 유지',()=>{
 const p={...place,schedule:validateSchedule({type:'monthly',day:31,startDate:'2026-01-15',endDate:'2026-12-30'})};
 assert.equal(scheduledOn(p,'2026-01-31'),true);assert.equal(scheduledOn(p,'2026-03-31'),true);assert.equal(scheduledOn(p,'2026-02-28'),false);assert.equal(scheduledOn(p,'2026-04-30'),false);assert.equal(scheduledOn(p,'2026-12-31'),false);
 const leap={...p,schedule:{type:'monthly',day:29,startDate:'2027-01-01',endDate:''}};assert.equal(scheduledOn(leap,'2028-02-29'),true);assert.equal(scheduledOn(leap,'2027-02-28'),false);
 const holiday={...place,skipHolidays:true,schedule:{type:'monthly',day:5,startDate:'2026-01-01',endDate:''}};assert.equal(scheduledOn(holiday,'2026-05-05'),false);assert.equal(scheduledOn({...holiday,skipHolidays:false},'2026-05-05'),true);assert.equal(scheduledOn({...holiday,skipHolidays:false,extraDaysOff:['2026-05-05']},'2026-05-05'),false);
 const d=validateData({...emptyData(),places:[p]});assert.deepEqual(d.places[0].schedule,p.schedule);assert.equal(monthForecastPay(d,'2026-03'),126000);assert.equal(monthForecastPay(d,'2026-04'),0);
 for(const schedule of [{...p.schedule,day:0},{...p.schedule,day:32},{...p.schedule,day:1.5},{...p.schedule,endDate:'2025-12-31'}])assert.throws(()=>validateSchedule(schedule));
});
test('반복 일정의 요일, 기간, 월 경계 및 하루 근무',()=>{
 const p={...place,schedule:validateSchedule({type:'weekly',days:[3,1],startDate:'2026-11-02',endDate:'2026-12-02'})};
 assert.deepEqual(p.schedule.days,[1,3]);
 for(const date of ['2026-11-02','2026-11-04','2026-11-30','2026-12-02'])assert.equal(scheduledOn(p,date),true);
 for(const date of ['2026-10-28','2026-11-03','2026-12-07'])assert.equal(scheduledOn(p,date),false);
 const once={...place,schedule:{type:'once',date:'2026-11-08'}};
 assert.equal(scheduledOn(once,'2026-11-08'),true);assert.equal(scheduledOn(once,'2026-11-15'),false);
 assert.equal(scheduledOn({...p,schedule:{...p.schedule,endDate:''}},'2027-01-04'),true);
 for(const s of [{type:'weekly',days:[],startDate:'2026-11-01',endDate:''},{...p.schedule,days:[1,1]},{...p.schedule,endDate:'2026-10-01'},{type:'once',date:'2026-02-30'},{...p.schedule,days:[7]}])assert.throws(()=>validateSchedule(s));
});
test('월 전체 급여 예상은 실제 기록을 우선하고 휴일·삭제한 일정을 제외',()=>{
 const p={...place,rate:10000,schedule:{type:'weekly',days:[1],startDate:'2026-11-01',endDate:'2026-11-30'}};
 const data={...emptyData(),places:[p],records:[{id:'r1',place:p.id,date:'2026-11-02',start:'09:00',end:'16:00',break:60,rate:10000,note:''}]};
 assert.equal(monthForecastPay(data,'2026-11'),340000);
 data.places[0]={...p,extraDaysOff:['2026-11-09']};assert.equal(monthForecastPay(data,'2026-11'),270000);
 data.places.push({...place,id:'once',rate:10000,skipHolidays:true,schedule:{type:'once',date:'2026-05-05'}});
 assert.equal(monthForecastPay(data,'2026-05'),0);data.places[1].skipHolidays=false;assert.equal(monthForecastPay(data,'2026-05'),70000);
 assert.equal(monthForecastPay(data,'2027-01'),0);
});
test('일정 서버 저장과 기존 백업 호환, 실제 기록이 있으면 예정 중복 방지',()=>{
 const old=validateData({...emptyData(),places:[place]});assert.equal(old.places[0].schedule,undefined);
 const v=validateData({...emptyData(),places:[{...place,schedule:{type:'once',date:'2026-11-08'}}]});
 assert.equal(v.places[0].schedule.date,'2026-11-08');assert.equal(plannedPlaces(v,'2026-11-08').length,1);assert.equal(v.records.length,0);
 v.records.push({id:'r1',place:place.id,date:'2026-11-08',start:'09:00',end:'17:00',break:60,rate:18000,note:''});
 assert.equal(plannedPlaces(validateData(v),'2026-11-08').length,0);
});
