import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {holidayEntries} from './public/holidays.js';
const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export function parseHolidayPage(html,year){
  if(!html.includes(year+'년 달력자료'))throw Error('연도 불일치');
  const heading=html.match(/<h[1-6]\b[^>]*>\s*국경일과 공휴일\s*<\/h[1-6]>/i);
  if(!heading)throw Error('공휴일 표 없음');
  const table=html.slice(heading.index+heading[0].length).match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if(!table)throw Error('공휴일 표 없음');
  const days={};
  for(const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>clean(m[1]));
    if(!cells.length)continue;
    if(cells.length!==4)throw Error('공휴일 표 형식 변경');
    for(let i=0;i<4;i+=2){
      if(!cells[i])continue;
      if(cells[i].includes('**'))continue; // 국경일이지만 공휴일은 아닌 항목.
      const name=cells[i].replace(/\*/g,'').trim();
      const matches=[...cells[i+1].matchAll(/(\d{1,2})월\s*(\d{1,2})일/g)];
      if(!matches.length||matches.length>2||name.length>80)throw Error('공휴일 날짜 형식 변경');
      const date=m=>year+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');
      const first=date(matches[0]),last=date(matches.at(-1));
      for(const value of [first,last])if(!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('공휴일 날짜 오류');
      const count=(Date.parse(last)-Date.parse(first))/86400000;
      if(count<0||count>3)throw Error('공휴일 기간 오류');
      for(let d=0;d<=count;d++)days[new Date(Date.parse(first)+d*86400000).toISOString().slice(5,10)]=name;
    }
  }
  if(Object.keys(days).length<15||Object.keys(days).length>60||!['01-01','05-05','08-15','10-03','12-25'].every(d=>days[d]))throw Error('불완전한 공휴일 자료');
  // 2026년 달력자료의 노동절 누락을 인사혁신처 개정 발표로 보완.
  if(year===2026){days['05-01']='노동절';days['07-17']='제헌절';}
  return days;
}
export function createHolidayService({dataDir,fetcher=fetch,now=Date.now}){
  const states=new Map(),pending=new Map();
  const filename=year=>path.join(dataDir,'holidays-'+year+'.json');
  function load(year){
    if(states.has(year))return states.get(year);
    let state={days:holidayEntries(year),checkedAt:null,attemptedAt:0,error:null};
    try{const cached=JSON.parse(readFileSync(filename(year),'utf8'));if(cached.year===year&&Number.isFinite(cached.checkedAt)&&cached.checkedAt<=now()&&cached.days&&Object.keys(cached.days).length>=15&&Object.keys(cached.days).length<=60&&Object.entries(cached.days).every(([d,n])=>/^\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(year+'-'+d))&&new Date(year+'-'+d).toISOString().slice(0,10)===year+'-'+d&&typeof n==='string'&&n.length>0&&n.length<=80))state={...state,days:cached.days,checkedAt:cached.checkedAt,attemptedAt:cached.checkedAt};}catch{}
    states.set(year,state);return state;
  }
  function result(year,state){return {year,days:state.days,checkedAt:state.checkedAt,available:Object.keys(state.days).length>0,source:'한국천문연구원 달력자료',sourceUrl:'https://astro.kasi.re.kr/kor/life/post/calendarData?year='+year,error:state.error};}
  async function get(year,{force=false}={}){
    if(!Number.isInteger(year)||year<2000||year>2100)throw Error('연도 오류');
    const state=load(year);
    if(pending.has(year))return pending.get(year);
    if(!force&&state.attemptedAt&&now()-state.attemptedAt<24*60*60000)return result(year,state);
    const task=(async()=>{
      state.attemptedAt=now();
      try{
        const currentYear=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date(now())));
        if(year<2021||year>currentYear+2)throw Error('제공되지 않는 연도');
        const response=await fetcher('https://astro.kasi.re.kr/kor/life/post/calendarData?year='+year,{signal:AbortSignal.timeout(8000),redirect:'error'});
        if(!response.ok||Number(response.headers.get('content-length'))>1024*1024)throw Error('자료 응답 오류');
        const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,html='';
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024)throw Error('자료 크기 초과');html+=decoder.decode(value,{stream:true});}html+=decoder.decode();}finally{await reader.cancel();}
        const days=parseHolidayPage(html,year),checkedAt=now();
        // 새 자료가 검증·저장된 뒤에만 기존 캐시를 교체한다.
        const file=filename(year);writeFileSync(file+'.tmp',JSON.stringify({year,days,checkedAt}),{mode:0o600});renameSync(file+'.tmp',file);
        state.days=days;state.checkedAt=checkedAt;state.error=null;
      }catch{state.error='최신 휴일 자료를 확인하지 못했습니다. 마지막 저장 자료를 사용합니다.';}
      return result(year,state);
    })();
    pending.set(year,task);try{return await task;}finally{pending.delete(year);}
  }
  return {get};
}
