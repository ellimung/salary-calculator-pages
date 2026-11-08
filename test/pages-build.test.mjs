import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
test('Pages 빌드는 모든 모듈과 스타일에 같은 버전을 붙여 오래된 로그인 코드를 재사용하지 않는다',()=>{
 execFileSync(process.execPath,['build-pages.mjs'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
 const root=new URL('../pages-dist/',import.meta.url),html=readFileSync(new URL('index.html',root),'utf8'),version=html.match(/name="app-version" content="([a-f0-9]+)"/)[1];
 assert.ok(html.includes('src="./app.js?v='+version+'"'));assert.ok(html.includes('href="./account.css?v='+version+'"'));assert.ok(!html.includes('src="/'));
 for(const file of ['app.js','auth.js','local-api.js','model.js','annual.js']){const source=readFileSync(new URL(file,root),'utf8');for(const match of source.matchAll(/from ['"]([^'"]+)['"]/g))assert.ok(match[1].endsWith('?v='+version),file+': '+match[1]);}
 assert.equal(existsSync(new URL('data/salary.sqlite',root)),false);
});
