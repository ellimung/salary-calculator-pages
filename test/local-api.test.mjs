import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocalApi} from '../public/local-api.js';
import {emptyData} from '../public/model.js';
test('기기 저장: 암호화·계정 격리·복구키 교체·백업 복원·충돌·기존 세션 폐기',async()=>{
 const accounts=new Map();let queue=Promise.resolve();
 const store={get:async id=>structuredClone(accounts.get(id)),put:async a=>accounts.set(a.username,structuredClone(a))};
 const lock=task=>{const run=queue.then(task);queue=run.catch(()=>{});return run;};
 const options={store,lock,holidays:async year=>({year,available:false})},api=createLocalApi(options),other=createLocalApi(options),stale=createLocalApi(options);
 await assert.rejects(api('/api/workspace'),{status:401});
 await assert.rejects(api('/api/auth/register','POST',{username:'local_teacher',name:'기기 시험',password:'short'}));
 const first=await api('/api/auth/register','POST',{username:'local_teacher',name:'기기 시험',password:'original-pass'});
 assert.match(first.recoveryKey,/^hrk_/);assert.equal(first.user.isAdmin,false);
 await stale('/api/auth/login','POST',{username:'local_teacher',password:'original-pass'});
 const fixture={...emptyData(),places:[{id:'school',name:'학교',location:'교실',rate:40000,start:'09:00',end:'17:00',break:60}],records:[{id:'record',place:'school',date:'2026-11-09',rate:40000,start:'09:00',end:'17:00',break:60,note:'비공개 급여 기록'}],adjustments:{'2026-11':{allowance:100,deduction:0}}};
 await api('/api/workspace','PUT',{data:fixture,revision:0});
 const stored=JSON.stringify(accounts.get('local_teacher'));for(const secret of ['original-pass',first.recoveryKey,'비공개 급여 기록','교실'])assert.ok(!stored.includes(secret));
 await assert.rejects(stale('/api/workspace','PUT',{data:emptyData(),revision:0}),{status:409});
 await other('/api/auth/register','POST',{username:'other_teacher',name:'다른 기기 계정',password:'different-pass'});
 assert.equal((await other('/api/workspace')).data.records.length,0);
 await assert.rejects(api('/api/admin/users'),{status:404});
 await api('/api/auth/logout','POST');await assert.rejects(api('/api/auth/login','POST',{username:'local_teacher',password:'wrong-pass'}),{status:401});
 await assert.rejects(api('/api/auth/recover','POST',{username:'local_teacher',recoveryKey:'wrong-key',password:'replacement-pass'}),{status:401});
 const recovered=await api('/api/auth/recover','POST',{username:'local_teacher',recoveryKey:first.recoveryKey,password:'replacement-pass'});
 assert.notEqual(recovered.recoveryKey,first.recoveryKey);assert.equal((await api('/api/workspace')).data.records[0].note,'비공개 급여 기록');
 await assert.rejects(stale('/api/workspace'),{status:401});
 const fresh=createLocalApi(options);await assert.rejects(fresh('/api/auth/session'),{status:401});
 await assert.rejects(fresh('/api/auth/login','POST',{username:'local_teacher',password:'original-pass'}),{status:401});
 await assert.rejects(fresh('/api/auth/recover','POST',{username:'local_teacher',recoveryKey:first.recoveryKey,password:'another-pass'}),{status:401});
 await fresh('/api/auth/login','POST',{username:'local_teacher',password:'replacement-pass'});
 // Restoring the JSON backup changes workspace data only, leaving credential wrapping intact.
 const backup=JSON.parse(JSON.stringify((await fresh('/api/workspace')).data));
 await fresh('/api/workspace','PUT',{data:emptyData(),revision:1});await fresh('/api/workspace','PUT',{data:backup,revision:2});assert.equal((await fresh('/api/workspace')).data.records.length,1);
 // Large valid workspaces must survive base64 conversion without argument-stack overflow.
 const large={...fixture,records:Array.from({length:1000},(_,i)=>({...fixture.records[0],id:'r'+i,date:new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10),note:'긴 메모'.repeat(30)}))};
 await fresh('/api/workspace','PUT',{data:large,revision:3});assert.equal((await fresh('/api/workspace')).data.records.length,1000);
});
