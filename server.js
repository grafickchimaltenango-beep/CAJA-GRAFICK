// Grafick · Caja con aprobación de pedidos por enlace. Sin dependencias (Node 18+).
const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const PORT=process.env.PORT||3000,DIR=process.env.DATA_DIR||path.join(__dirname,"data"),FILE=path.join(DIR,"db.json"),PUB=path.join(__dirname,"public");
const PINS={admin:process.env.ADMIN_PIN,cajero:process.env.CAJERO_PIN};
if(!PINS.admin||!PINS.cajero){console.error("Defina ADMIN_PIN y CAJERO_PIN");process.exit(1)}
fs.mkdirSync(DIR,{recursive:true});
let DB={days:{},conf:null,ap:{}};try{DB={...DB,...JSON.parse(fs.readFileSync(FILE,"utf8"))}}catch(e){}
const save=()=>{const t=FILE+".tmp";fs.writeFileSync(t,JSON.stringify(DB));fs.renameSync(t,FILE)};
const S=new Map(),F=new Map(),DAYS=["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const hh=()=>new Date().toLocaleTimeString("es-GT",{hour:"2-digit",minute:"2-digit",timeZone:"America/Guatemala"});
const lg=(d,t)=>d.log.push({t,r:"Cliente",h:hh()});
// Aplica (de forma idempotente) las respuestas de clientes a las ventas del día.
function inject(d){d.log=d.log||[];d.exp=d.exp||[];(d.sales||[]).forEach(s=>{const a=DB.ap[s.tok];if(!a||s.apr!=="pend")return;
 if(a.r==="ok"){s.apr="ok";s.aprAt=a.at;s.aprNote="Aprobó el cliente desde el enlace";lg(d,s.no+" aprobado por el cliente (enlace)")}
 else if(!d.closed&&!s.void){s.apr="no";s.aprAt=a.at;s.void="Rechazado por el cliente: "+a.m;(s.pay||[]).filter(p=>p.m==="Efectivo").forEach(p=>d.exp.push({c:"Devolución "+s.no,a:p.a}));lg(d,s.no+" rechazado por el cliente: "+a.m)}
 else if(d.closed&&!d.log.some(l=>l.t.includes(s.no+" rechazo")))lg(d,s.no+" rechazo del cliente con el día cerrado: "+a.m)})}
const json=(res,c,o)=>{res.writeHead(c,{"Content-Type":"application/json"});res.end(JSON.stringify(o))};
const body=req=>new Promise(r=>{let b="";req.on("data",c=>{b+=c;if(b.length>2e6)req.destroy()});req.on("end",()=>{try{r(JSON.parse(b||"{}"))}catch(e){r({})}})});
const find=tok=>{if(!tok)return[];for(const n in DB.days){const s=(DB.days[n].sales||[]).find(x=>x.tok===tok);if(s)return[n,s]}return[]};
const TYPES={".html":"text/html;charset=utf-8",".jpg":"image/jpeg",".png":"image/png",".js":"text/javascript",".webmanifest":"application/manifest+json"};
function file(res,name){fs.readFile(path.join(PUB,path.basename(name)),(e,d)=>{if(e){res.writeHead(404);return res.end("No encontrado")}res.writeHead(200,{"Content-Type":TYPES[path.extname(name)]||"application/octet-stream","Cache-Control":"no-store"});res.end(d)})}
http.createServer(async(req,res)=>{const p=new URL(req.url,"http://x").pathname,m=req.method;
 try{
 if(m==="GET"&&p.startsWith("/a/"))return file(res,"aprobar.html");
 if(p.startsWith("/api/public/")){const tok=p.slice(12),[n,s]=find(tok);if(!s)return json(res,404,{e:"Pedido no encontrado"});
  if(m==="GET")return json(res,200,{no:s.no,cli:s.cli,items:s.items,total:s.total,iva:s.iva||0,est:DB.ap[tok]?DB.ap[tok].r:s.void?"x":s.apr==="pend"?"pend":"ok"});
  if(m==="POST"){const b=await body(req);if(DB.ap[tok]||s.apr!=="pend"||s.void)return json(res,409,{e:"Este pedido ya fue respondido"});
   const r=b.r==="no"?"no":"ok";DB.ap[tok]={r,m:String(b.m||"sin motivo").slice(0,200),at:Date.now()};inject(DB.days[n]);save();return json(res,200,{ok:1,r})}}
 if(m==="POST"&&p==="/api/login"){const ip=req.socket.remoteAddress,f=F.get(ip)||0;if(f>=8)return json(res,429,{e:"Demasiados intentos. Espere 10 minutos."});
  const b=await body(req),rl=b.pin===PINS.admin?"admin":b.pin===PINS.cajero?"cajero":null;
  if(!rl){F.set(ip,f+1);setTimeout(()=>F.delete(ip),6e5);return json(res,401,{e:"PIN incorrecto"})}
  const t=crypto.randomBytes(24).toString("hex");S.set(t,rl);return json(res,200,{token:t,role:rl})}
 if(p.startsWith("/api/")){const rl=S.get(req.headers["x-token"]);if(!rl)return json(res,401,{e:"auth"});
  if(m==="GET"&&p==="/api/state"){Object.values(DB.days).forEach(inject);return json(res,200,{days:DB.days,conf:DB.conf})}
  if(m==="PUT"&&p.startsWith("/api/day/")){const n=decodeURIComponent(p.slice(9));if(!DAYS.includes(n))return json(res,400,{e:"Día inválido"});
   if(rl!=="admin"&&DB.days[n]&&DB.days[n].closed)return json(res,403,{e:"Día cerrado: solo el administrador puede modificarlo"});
   const b=await body(req);inject(b);DB.days[n]=b;save();return json(res,200,{ok:1})}
  if(m==="PUT"&&p==="/api/conf"){if(rl!=="admin")return json(res,403,{e:"Solo el administrador"});DB.conf=await body(req);save();return json(res,200,{ok:1})}
  return json(res,404,{e:"?"})}
 if(m==="GET")return file(res,p==="/"?"index.html":p.slice(1));
 res.writeHead(405);res.end()}catch(e){console.error(e);json(res,500,{e:"Error del servidor"})}
}).listen(PORT,()=>console.log("Grafick Caja en http://localhost:"+PORT));
