import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {holidayEntries} from './public/holidays.js';
import {createHolidayService} from './holiday-service.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'pages-dist');mkdirSync(out,{recursive:true});
const files=readdirSync(path.join(root,'public')).filter(file=>/\.(html|js|css|svg)$/.test(file)).sort(),hash=createHash('sha256');
for(const file of files)hash.update(file+'\n'+readFileSync(path.join(root,'public',file),'utf8').replaceAll('\r\n','\n'));
const version=hash.digest('hex').slice(0,16);
for(const file of files){let text=readFileSync(path.join(root,'public',file),'utf8');if(file==='index.html')text=text.replace('<head>','<head><meta name="storage-mode" content="local"><meta name="app-version" content="'+version+'">');if(file==='index.html'||file==='app.js')text=text.replace(/(href|src)="\//g,'$1="./');if(file.endsWith('.js'))text=text.replace(/(['"])(\.\/[^'"\s]+\.js)\1/g,(_,quote,url)=>quote+url+'?v='+version+quote);if(file==='index.html')text=text.replace(/((?:href|src)="\.\/[^"\s]+\.(?:js|css|svg))"/g,'$1?v='+version+'"');writeFileSync(path.join(out,file),text);}
writeFileSync(path.join(out,'.nojekyll'),'');mkdirSync(path.join(out,'holiday-data'),{recursive:true});
const year=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()));
const cacheDir=path.join(root,'test-results','holiday-build-cache');mkdirSync(cacheDir,{recursive:true});
const service=createHolidayService({dataDir:cacheDir});
for(const y of new Set([2026,2027,year-1,year,year+1,year+2])){
 let state={year:y,days:holidayEntries(y),available:Object.keys(holidayEntries(y)).length>0,checkedAt:null,error:'최신 자동 자료는 아직 확인되지 않았습니다.'};
 if(process.argv.includes('--update-holidays'))state=await service.get(y,{force:true});
 writeFileSync(path.join(out,'holiday-data',y+'.json'),JSON.stringify(state));
}
console.log('GitHub Pages용 정적 파일: '+out);
