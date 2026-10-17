import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
export function servePreview({port=4173,base=process.env.PREVIEW_BASE_PATH??'/sakku/'}={}){
 const root=resolve('dist-preview');
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
 const server=createServer(async(request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  if(!pathname.startsWith(base)){response.writeHead(404).end();return;}
  const file=resolve(root,pathname.slice(base.length)||'index.html');
  if(file!==root&&!file.startsWith(root+'/')){response.writeHead(403).end();return;}
  try{if(!(await stat(file)).isFile())throw Error('Not a file');response.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'});response.end(await readFile(file));}catch{response.writeHead(404).end();}
 });
 return new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server)));
}
if(process.argv[1]===new URL(import.meta.url).pathname){await servePreview();process.stdout.write('UI preview http://127.0.0.1:4173'+(process.env.PREVIEW_BASE_PATH??'/sakku/')+'\n');}
