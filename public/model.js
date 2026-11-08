import {holidayName} from './holidays.js';
export const emptyData = () => ({version:1,sample:false,places:[],records:[],adjustments:{}});
const id = v => typeof v==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const text = (v,max) => typeof v==='string' && v.length<=max;
const num = (v,max) => Number.isSafeInteger(v) && v>=0 && v<=max;
const tm = v => typeof v==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const timeMinutes = t => Number(t.slice(0,2))*60+Number(t.slice(3));
export function durationMinutes(r){let n=timeMinutes(r.end)-timeMinutes(r.start);if(n<0)n+=1440;return n;}
export const paidHours = r => (durationMinutes(r)-r.break)/60;
export function validDuration(r){return tm(r.start)&&tm(r.end)&&num(r.break,1439)&&durationMinutes(r)>r.break;}
const validDate = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v>='2000-01-01' && v<='2100-12-31' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
export function validateSchedule(s){
  if(s===undefined||s===null)return null;
  if(s.type==='once'&&validDate(s.date))return {type:'once',date:s.date};
  if(s.type==='weekly'&&validDate(s.startDate)&&(s.endDate===''||validDate(s.endDate)&&s.endDate>=s.startDate)&&Array.isArray(s.days)&&s.days.length>0&&s.days.length<=7&&s.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6)&&new Set(s.days).size===s.days.length)return {type:'weekly',startDate:s.startDate,endDate:s.endDate,days:[...s.days].sort()};
  throw new Error('근무 일정의 날짜와 반복 요일을 확인해 주세요.');
}
export function scheduledOn(p,date){
  const s=p.schedule;if(!s||!validDate(date)||p.extraDaysOff?.includes(date)||(p.skipHolidays&&holidayName(date)))return false;
  return s.type==='once'?s.date===date:date>=s.startDate&&(!s.endDate||date<=s.endDate)&&s.days.includes(new Date(date+'T00:00:00Z').getUTCDay());
}
export function plannedPlaces(data,date){return data.places.filter(p=>scheduledOn(p,date)&&!data.records.some(r=>r.date===date&&r.place===p.id));}
export function monthForecastPay(data,month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('조회 월을 확인해 주세요.');
  const [year,m]=month.split('-').map(Number),count=new Date(Date.UTC(year,m,0)).getUTCDate();
  let total=data.records.filter(r=>r.date.startsWith(month)).reduce((sum,r)=>sum+paidHours(r)*r.rate,0);
  for(let day=1;day<=count;day++){const date=month+'-'+String(day).padStart(2,'0');for(const p of plannedPlaces(data,date))total+=paidHours(p)*p.rate;}
  return total;
}
// Match the monthly salary screen: round each month's base pay before adding adjustments.
export function selectedMonthIncome(data,month,excluded=new Set()){
  const partial=data.places.some(p=>excluded.has(p.id));
  const selected={...data,places:data.places.filter(p=>!excluded.has(p.id)),records:data.records.filter(r=>!excluded.has(r.place))};
  const records=selected.records.filter(r=>r.date.startsWith(month));
  const base=records.reduce((s,r)=>s+paidHours(r)*r.rate,0);
  const adjust=partial?{allowance:0,deduction:0}:data.adjustments[month]||{allowance:0,deduction:0};
  return {records,base,adjust,partial,net:Math.round(base)+adjust.allowance-adjust.deduction,forecast:Math.round(monthForecastPay(selected,month))+adjust.allowance-adjust.deduction};
}
export function annualIncome(data,year){
  if(!Number.isInteger(year)||year<2000||year>2100)throw Error('조회 연도를 확인해 주세요.');
  const months=Array.from({length:12},(_,i)=>{
    const month=`${year}-${String(i+1).padStart(2,'0')}`,records=data.records.filter(r=>r.date.startsWith(month));
    const base=Math.round(records.reduce((sum,r)=>sum+paidHours(r)*r.rate,0));
    const {allowance=0,deduction=0}=data.adjustments[month]||{};
    return {month,base,allowance,deduction,net:base+allowance-deduction,days:new Set(records.map(r=>r.date)).size,hours:records.reduce((sum,r)=>sum+paidHours(r),0)};
  });
  const records=data.records.filter(r=>r.date.startsWith(`${year}-`)),groups=new Map(),names=new Map(data.places.map(p=>[p.id,p.name]));
  for(const r of records){const name=names.get(r.place)||'삭제된 근무지';if(!groups.has(name))groups.set(name,{name,base:0,hours:0,dates:new Set()});const g=groups.get(name);g.base+=paidHours(r)*r.rate;g.hours+=paidHours(r);g.dates.add(r.date);}
  return {year,months,base:months.reduce((s,m)=>s+m.base,0),allowance:months.reduce((s,m)=>s+m.allowance,0),deduction:months.reduce((s,m)=>s+m.deduction,0),net:months.reduce((s,m)=>s+m.net,0),days:new Set(records.map(r=>r.date)).size,hours:months.reduce((s,m)=>s+m.hours,0),places:[...groups.values()].filter(g=>Math.round(g.base)>0).map(g=>({name:g.name,base:Math.round(g.base),hours:g.hours,days:g.dates.size})).sort((a,b)=>b.base-a.base)};
}
export function excludeWorkDate(p,date){
  if(!validDate(date))throw Error('근무 날짜를 확인해 주세요.');
  const dates=[...new Set([...(p.extraDaysOff||[]),date])];
  if(dates.length>100)throw Error('추가 휴무일은 최대 100개까지 등록할 수 있습니다.');
  return {...p,extraDaysOff:dates.sort()};
}
export function validateData(v){
  const fail=()=>{throw new Error('기록 형식이 올바르지 않습니다. 월급하루 백업 파일을 확인해 주세요.');};
  if(!v||v.version!==1||typeof v.sample!=='boolean'||!Array.isArray(v.places)||!Array.isArray(v.records)||!v.adjustments||typeof v.adjustments!=='object'||Array.isArray(v.adjustments)||v.places.length>100||v.records.length>10000)fail();
  const places=[],records=[],ids=new Set(),rids=new Set();
  for(const p of v.places){
    if(!p||!id(p.id)||ids.has(p.id)||!text(p.name,60)||!p.name.trim()||!text(p.location,80)||!num(p.rate,10000000)||!validDuration(p))fail();
    if(p.skipHolidays!==undefined&&typeof p.skipHolidays!=='boolean')fail();
    if(p.extraDaysOff!==undefined&&(!Array.isArray(p.extraDaysOff)||p.extraDaysOff.length>100||!p.extraDaysOff.every(validDate)||new Set(p.extraDaysOff).size!==p.extraDaysOff.length))fail();
    const schedule=validateSchedule(p.schedule);
    ids.add(p.id);places.push({id:p.id,name:p.name.trim(),location:p.location,rate:p.rate,start:p.start,end:p.end,break:p.break,...(p.skipHolidays!==undefined?{skipHolidays:p.skipHolidays}:{}),...(p.extraDaysOff!==undefined?{extraDaysOff:[...p.extraDaysOff].sort()}:{}),...(schedule?{schedule}:{})});
  }
  for(const r of v.records){
    if(!r||!id(r.id)||rids.has(r.id)||!ids.has(r.place)||typeof r.date!=='string'||!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(r.date)||r.date<'2000-01-01'||r.date>'2100-12-31'||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date||!num(r.rate,10000000)||!validDuration(r)||!text(r.note,200))fail();
    rids.add(r.id);records.push({id:r.id,date:r.date,place:r.place,start:r.start,end:r.end,break:r.break,rate:r.rate,note:r.note});
  }
  const sorted=[...records].sort((a,b)=>a.place.localeCompare(b.place)||a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
  let prior;
  for(const r of sorted){const start=Date.parse(r.date)+timeMinutes(r.start)*60000,end=start+durationMinutes(r)*60000;if(prior&&prior.place===r.place&&start<prior.end)throw new Error('같은 근무지의 근무시간이 겹칩니다.');prior={place:r.place,end};}
  const adjustments=Object.create(null);
  for(const [k,a] of Object.entries(v.adjustments)){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(k)||k<'2000-01'||k>'2100-12'||!a||!num(a.allowance,1e9)||!num(a.deduction,1e9))fail();
    adjustments[k]={allowance:a.allowance,deduction:a.deduction};
  }
  return {version:1,sample:v.sample,places,records,adjustments};
}
