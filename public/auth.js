import {createLocalApi} from './local-api.js';
export const localMode=document.querySelector('meta[name="storage-mode"]')?.content==='local';
const localApi=localMode?createLocalApi():null;
export let currentUser=null;
export let csrf='';
export function setAuth(result){currentUser=result?.user||null;csrf=result?.csrf||'';}
export async function api(url,method='GET',body){
  if(localApi)return localApi(url,method,body);
  const headers={Accept:'application/json'};
  if(method!=='GET'){headers['Content-Type']='application/json';headers['X-Haru-Request']='1';if(csrf)headers['X-CSRF-Token']=csrf;}
  let res;
  try{res=await fetch(url,{method,headers,credentials:'same-origin',cache:'no-store',body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}
  catch{throw Error('서버에 연결하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');}
  let value;try{value=await res.json();}catch{throw Error('서버 응답을 확인하지 못했습니다.');}
  if(!res.ok){const err=new Error(value.error||'요청을 처리하지 못했습니다.');err.status=res.status;throw err;}
  return value;
}
