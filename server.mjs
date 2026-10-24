import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(import.meta.dirname),port=Number(process.env.PORT||4173);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
http.createServer(async(req,res)=>{try{
const path=decodeURIComponent(new URL(req.url,'http://local').pathname);
let file=resolve(root,path==='/'||path.startsWith('/game/')?'index.html':'.'+path);
if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}

const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
}catch{res.writeHead(404).end('Not found');}}).listen(port,'0.0.0.0',()=>console.log(`쑨플레이 http://localhost:${port}`));
