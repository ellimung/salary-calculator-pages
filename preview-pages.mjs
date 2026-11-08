import http from 'node:http';
import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'pages-dist');
const files=new Map();
function collect(dir,prefix=''){for(const entry of readdirSync(dir,{withFileTypes:true})){if(entry.isDirectory())collect(path.join(dir,entry.name),prefix+entry.name+'/');else if(/\.(html|js|css|svg|json)$/.test(entry.name))files.set('/'+prefix+entry.name,readFileSync(path.join(dir,entry.name)));}}
collect(root);
const types={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',json:'application/json'};
http.createServer((req,res)=>{const route=new URL(req.url,'http://localhost').pathname.replace(/^\/salary-calculator(?=\/)/,'');const name=route==='/'?'/index.html':route,body=files.get(name);if(req.method!=='GET'||!body){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':(types[name.split('.').at(-1)]||'text/plain')+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"});res.end(body);}).listen(Number(process.env.PORT||4173),process.env.HOST||'127.0.0.1',()=>console.log('GitHub Pages용 기기 저장 앱: http://'+(process.env.HOST||'127.0.0.1')+':'+(process.env.PORT||4173)+'/salary-calculator/'));
