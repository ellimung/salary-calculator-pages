import {emptyData,validateData} from './model.js';
const enc=new TextEncoder(),dec=new TextDecoder();
const encode=b=>{const bytes=new Uint8Array(b),parts=[];for(let i=0;i<bytes.length;i+=32768)parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));return btoa(parts.join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');};
const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const random=n=>crypto.getRandomValues(new Uint8Array(n));
const fail=(message,status=400)=>{const error=Error(message);error.status=status;throw error;};
const passwordOK=p=>typeof p==='string'&&[...p].length>=8&&[...p].length<=128&&enc.encode(p).length<=512;
async function passwordKey(password,salt){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:decode(salt),iterations:600000,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function recoveryKey(key){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(key)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
const dataKey=raw=>crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
async function seal(key,value,aad){const iv=random(12),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(aad)},key,value);return {iv:encode(iv),cipher:encode(cipher)};}
async function open(key,box,aad){return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(box.iv),additionalData:enc.encode(aad)},key,decode(box.cipher)));}

export function browserStore(){
 let database;
 const db=()=>database||=(new Promise((resolve,reject)=>{const request=indexedDB.open('haru-local-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('accounts',{keyPath:'username'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('브라우저 저장소를 열지 못했습니다. 일반 창에서 저장 권한을 확인해 주세요.'));}));
 const write=async(value,oldUsername)=>{const connection=await db();await new Promise((resolve,reject)=>{const tx=connection.transaction('accounts','readwrite'),accounts=tx.objectStore('accounts');if(oldUsername)accounts.delete(oldUsername);accounts.put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(Error('저장 공간이 부족하거나 저장이 취소되었습니다. 백업을 내려받아 주세요.'));});};
 return {async get(username){const connection=await db();return new Promise((resolve,reject)=>{const request=connection.transaction('accounts').objectStore('accounts').get(username);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});},put:value=>write(value),rename:(oldUsername,value)=>write(value,oldUsername)};
}

// Session keys remain in memory. Reloading or closing the page locks the local account.
export function createLocalApi({store=browserStore(),lock=task=>{
 if(!globalThis.navigator?.locks)fail('이 브라우저는 안전한 동시 저장을 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용해 주세요.');
 return navigator.locks.request('haru-local-accounts',task);
},holidays=async year=>{
 try{const response=await fetch(new URL(`holiday-data/${year}.json`,import.meta.url),{cache:'no-store'});if(!response.ok)throw Error();return await response.json();}catch{return {year,available:false,error:'이 연도의 최신 휴일 자료를 불러오지 못했습니다. 배포된 자료와 추가 휴무일을 확인해 주세요.'};}
}}={}){
 let session=null;
 const user=a=>({id:a.id,username:a.username,name:a.name,isAdmin:false,mustChangePassword:false});
 const result=a=>({user:user(a),csrf:'local'});
 async function authenticated(){if(!session)fail('다시 로그인해 주세요.',401);const a=await store.get(session.username);if(!a||a.credentialVersion!==session.version){session=null;fail('비밀번호가 변경되었습니다. 다시 로그인해 주세요.',401);}return a;}
 return async (url,method='GET',body={})=>lock(async()=>{
   if(url==='/api/auth/logout'&&method==='POST'){session=null;return {ok:true};}
   if(url==='/api/auth/register'&&method==='POST'){
     const username=String(body.username||'').trim().toLowerCase(),name=String(body.name||'').trim();
     if(!/^[a-z][a-z0-9_]{3,23}$/.test(username))fail('아이디는 영문으로 시작하는 4~24자의 영문·숫자·밑줄로 입력해 주세요.');
     if(!name||name.length>40)fail('이름 또는 별명을 40자 이내로 입력해 주세요.');
     if(!passwordOK(body.password))fail('비밀번호는 8~128자로 입력해 주세요.');
     if(await store.get(username))fail('이 브라우저에 이미 있는 아이디입니다.',409);
     const raw=random(32),key=await dataKey(raw),salt=encode(random(16)),recovery='hrk_'+encode(random(32));
     const a={username,name,id:crypto.randomUUID(),credentialVersion:crypto.randomUUID(),salt,revision:0};
     a.passwordWrap=await seal(await passwordKey(body.password,salt),raw,username+'|password');a.recoveryWrap=await seal(await recoveryKey(recovery),raw,username+'|recovery');
     a.workspace=await seal(key,enc.encode(JSON.stringify(emptyData())),a.id+'|workspace');await store.put(a);
     session={username,version:a.credentialVersion,key};return {...result(a),recoveryKey:recovery};
   }
   if((url==='/api/auth/login'||url==='/api/auth/recover')&&method==='POST'){
     const recovering=url.endsWith('recover'),username=String(body.username||'').trim().toLowerCase(),a=await store.get(username);
     if(recovering&&!passwordOK(body.password))fail('새 비밀번호는 8~128자로 입력해 주세요.');
     if(!a)fail('이 브라우저에 등록되지 않은 아이디입니다. 기존 localhost 계정은 자동 이전되지 않습니다. 새 주소에서 회원가입 후 근무기록 백업을 가져와 주세요.',401);
     let raw;
     try{raw=recovering?await open(await recoveryKey(String(body.recoveryKey||'').trim()),a.recoveryWrap,username+'|recovery'):await open(await passwordKey(String(body.password||''),a.salt),a.passwordWrap,username+'|password');}
     catch{fail(recovering?'아이디 또는 복구키를 확인해 주세요.':'아이디 또는 비밀번호를 확인해 주세요.',401);}
     const key=await dataKey(raw);let recovery;
     if(recovering){recovery='hrk_'+encode(random(32));a.salt=encode(random(16));a.passwordWrap=await seal(await passwordKey(body.password,a.salt),raw,username+'|password');a.recoveryWrap=await seal(await recoveryKey(recovery),raw,username+'|recovery');a.credentialVersion=crypto.randomUUID();await store.put(a);}
     session={username,version:a.credentialVersion,key};return {...result(a),...(recovery?{recoveryKey:recovery}:{})};
   }
   const a=await authenticated();
   if(url==='/api/auth/session'&&method==='GET')return result(a);
   if((url==='/api/auth/profile'||url==='/api/auth/change-password')&&method==='POST'){
     const changingPassword=url.endsWith('change-password');let raw;
     try{raw=await open(await passwordKey(String(body.currentPassword||''),a.salt),a.passwordWrap,a.username+'|password');}catch{fail('현재 비밀번호를 확인해 주세요.',401);}
     let recovery;
     if(changingPassword){
       if(!passwordOK(body.password))fail('새 비밀번호는 8~128자로 입력해 주세요.');
       if(body.password===body.currentPassword)fail('새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.');
       a.salt=encode(random(16));a.passwordWrap=await seal(await passwordKey(body.password,a.salt),raw,a.username+'|password');
       recovery='hrk_'+encode(random(32));a.recoveryWrap=await seal(await recoveryKey(recovery),raw,a.username+'|recovery');a.credentialVersion=crypto.randomUUID();await store.put(a);
     }else{
       const name=String(body.name||'').trim(),username=String(body.username||'').trim().toLowerCase();
       if(!name||name.length>40)fail('이름 또는 별명을 40자 이내로 입력해 주세요.');
       if(!/^[a-z][a-z0-9_]{3,23}$/.test(username))fail('아이디는 영문으로 시작하는 4~24자의 영문·숫자·밑줄로 입력해 주세요.');
       if(username!==a.username){
         if(await store.get(username))fail('이 브라우저에서 이미 사용하는 아이디입니다.',409);
         const oldUsername=a.username;a.username=username;a.name=name;a.salt=encode(random(16));a.passwordWrap=await seal(await passwordKey(body.currentPassword,a.salt),raw,username+'|password');
         recovery='hrk_'+encode(random(32));a.recoveryWrap=await seal(await recoveryKey(recovery),raw,username+'|recovery');a.credentialVersion=crypto.randomUUID();await store.rename(oldUsername,a);
       }else{a.name=name;await store.put(a);}
     }
     session={username:a.username,version:a.credentialVersion,key:await dataKey(raw)};return {...result(a),...(recovery?{recoveryKey:recovery}:{})};
   }
   if(url==='/api/workspace'){
     if(method==='GET')return {data:validateData(JSON.parse(dec.decode(await open(session.key,a.workspace,a.id+'|workspace')))),revision:a.revision};
     if(method==='PUT'){if(body.revision!==a.revision)fail('다른 창의 기록이 변경되었습니다. 백업 후 다시 로그인해 주세요.',409);const data=validateData(body.data);a.workspace=await seal(session.key,enc.encode(JSON.stringify(data)),a.id+'|workspace');a.revision++;await store.put(a);return {revision:a.revision};}
   }
   const match=url.match(/^\/api\/holidays\/(\d{4})(\/refresh)?$/);if(match&&((method==='GET'&&!match[2])||(method==='POST'&&match[2])))return holidays(Number(match[1]));
   fail('기기 저장 버전에서 지원하지 않는 기능입니다.',404);
 });
}
