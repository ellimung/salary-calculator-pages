// 대한민국 공휴일 자료. 확인일: 2026-11-08.
// https://astro.kasi.re.kr/kor/life/post/calendarData?year=2026
// https://astro.kasi.re.kr/kor/life/post/calendarData?year=2027
// 노동절·제헌절 개정: https://www.mpm.go.kr/mpm/comm/newsPress/newsPressRelease/?cntId=4250&mode=view
// 일요일은 사용자가 선택한 요일을 따르며, 아래 목록은 명절·국경일 등 공휴일이다.
// 새 임시공휴일 지정 시 자료를 갱신한다. 자료가 없는 연도를 추정하지 않는다.
const holidays = {
  2026: {
    '01-01':'신정','02-16':'설 연휴','02-17':'설날','02-18':'설 연휴',
    '03-01':'삼일절','03-02':'대체공휴일','05-01':'노동절','05-05':'어린이날',
    '05-24':'부처님오신날','05-25':'대체공휴일','06-03':'지방선거일','06-06':'현충일',
    '07-17':'제헌절','08-15':'광복절','08-17':'대체공휴일',
    '09-24':'추석 연휴','09-25':'추석','09-26':'추석 연휴',
    '10-03':'개천절','10-05':'대체공휴일','10-09':'한글날','12-25':'성탄절'
  },
  2027: {
    '01-01':'신정','02-06':'설 연휴','02-07':'설날','02-08':'설 연휴','02-09':'대체공휴일',
    '03-01':'삼일절','05-01':'노동절','05-03':'대체공휴일','05-05':'어린이날',
    '05-13':'부처님오신날','06-06':'현충일','07-17':'제헌절','07-19':'대체공휴일',
    '08-15':'광복절','08-16':'대체공휴일','09-14':'추석 연휴','09-15':'추석','09-16':'추석 연휴',
    '10-03':'개천절','10-04':'대체공휴일','10-09':'한글날','10-11':'대체공휴일',
    '12-25':'성탄절','12-27':'대체공휴일'
  }
};
export const holidayYearSupported = year => Object.hasOwn(holidays,String(year));
export const holidayName = date => holidays[date.slice(0,4)]?.[date.slice(5)]||'';
export const holidayEntries = year => ({...(holidays[year]||{})});
export function setHolidayYear(year,days){
  if(!/^\d{4}$/.test(String(year))||!days||typeof days!=='object'||Array.isArray(days)||Object.keys(days).length>100)throw Error('공휴일 자료 형식 오류');
  for(const [date,name] of Object.entries(days)){const full=year+'-'+date;if(!/^\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(full))||new Date(full).toISOString().slice(0,10)!==full||typeof name!=='string'||!name||name.length>80)throw Error('공휴일 자료 형식 오류');}
  holidays[year]={...days};
}
