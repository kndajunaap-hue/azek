const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../public");
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "127.0.0.1";
const WIB = "Asia/Jakarta";
const POLL_MS = 60_000;
const mime = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".ico":"image/x-icon"};
const headers = {
  "Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Referrer-Policy":"strict-origin-when-cross-origin",
  "Permissions-Policy":"camera=(), microphone=(), geolocation=()",
  "Cache-Control":"no-store"
};
let statusCache = null;
let statusCheckedAt = null;
let statusPoll = null;
let newsCache = null;
let newsCheckedAt = 0;

function wibClock(){
  const parts = new Intl.DateTimeFormat("en-GB",{timeZone:WIB,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
  return {hour:Number(parts.find(item=>item.type==="hour").value),minute:Number(parts.find(item=>item.type==="minute").value)};
}
function maintenanceNow(){const {hour}=wibClock();return hour>=9&&hour<14;}
function secondsUntilMaintenanceEnds(){const {hour,minute}=wibClock();return Math.max(60,((14-hour)*60-minute)*60);}
function write(res,status,body,extra={}){res.writeHead(status,{...headers,...extra});res.end(body);}
function json(res,status,body){write(res,status,JSON.stringify(body),{"Content-Type":"application/json; charset=utf-8"});}
function maintenancePage(res){
  const retry=secondsUntilMaintenanceEnds();
  const body='<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sedang pemeliharaan</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#070b12;color:#dce7f4;font:15px system-ui"><main style="max-width:560px;padding:32px;text-align:center"><p style="color:#18d992;letter-spacing:.15em">LEO MONITOR</p><h1>Situs sedang dipelihara</h1><p>Pemeliharaan terjadwal berlangsung setiap hari pukul 09.00–14.00 WIB.</p><p style="color:#8394aa">Silakan kembali setelah pukul 14.00 WIB.</p></main><meta http-equiv="refresh" content="300"></body></html>';
  write(res,503,body,{"Content-Type":"text/html; charset=utf-8","Retry-After":String(retry)});
}
async function fetchJson(url){
  const response=await fetch(url,{headers:{Accept:"application/json","User-Agent":"LeoMonitor/1.0"},signal:AbortSignal.timeout(9000),cache:"no-store"});
  if(!response.ok)throw new Error(`Upstream HTTP ${response.status}`);
  return response.json();
}
async function checkDiscord(){
  const started=Date.now(),url="https://discordstatus.com/api/v2/summary.json";
  try{const data=await fetchJson(url),indicator=data.status?.indicator||"unknown",map={none:"operational",minor:"degraded",major:"outage",critical:"outage"};
    return {id:"discord",name:"Discord",scope:"Status resmi platform (Statuspage API)",status:map[indicator]||"unknown",detail:data.status?.description||"Status resmi tidak memberikan deskripsi.",latencyMs:Date.now()-started,checkedAt:new Date().toISOString(),sourceUpdatedAt:data.page?.updated_at||null,sourceUrl:"https://discordstatus.com/",sourceType:"official_status"};
  }catch{return {id:"discord",name:"Discord",scope:"Status resmi platform (Statuspage API)",status:"unknown",detail:"API status resmi tidak dapat dihubungi dari server monitor.",latencyMs:Date.now()-started,checkedAt:new Date().toISOString(),sourceUrl:"https://discordstatus.com/",sourceType:"official_status"};}
}
async function checkWhatsApp(){
  const started=Date.now(),base="https://metastatus.com/data";
  try{const [orgs,outages]=await Promise.all([fetchJson(`${base}/orgs.json`),fetchJson(`${base}/outages/whatsapp-business-api.json`)]);const org=orgs.find(item=>item.id==="whatsapp-business-api");if(!org)throw new Error("WhatsApp status data missing");const services=org.services||[],issues=services.filter(item=>item.status&&item.status.toLowerCase()!=="no known issues"),status=outages.length||issues.length?"degraded":"operational";const detail=outages.length?`${outages.length} gangguan aktif dilaporkan.`:issues.length?issues.map(item=>`${item.name}: ${item.status}`).join(" · "):`Tidak ada gangguan yang diketahui pada ${services.length} komponen WhatsApp Business.`;
    return {id:"whatsapp",name:"WhatsApp Business Platform",scope:"Status resmi Meta; komponen Business/Cloud API",status,detail,latencyMs:Date.now()-started,checkedAt:new Date().toISOString(),sourceUpdatedAt:null,sourceUrl:"https://metastatus.com/whatsapp-business-api",sourceType:"official_status"};
  }catch{return {id:"whatsapp",name:"WhatsApp Business Platform",scope:"Status resmi Meta; komponen Business/Cloud API",status:"unknown",detail:"Data status Meta tidak dapat dibaca. Status WhatsApp pribadi tidak tercakup halaman ini.",latencyMs:Date.now()-started,checkedAt:new Date().toISOString(),sourceUrl:"https://metastatus.com/whatsapp-business-api",sourceType:"official_status"};}
}
async function probeEndpoint(id,name,url){
  const started=Date.now();
  try{let response=await fetch(url,{method:"HEAD",redirect:"follow",signal:AbortSignal.timeout(9000),headers:{"User-Agent":"LeoMonitor/1.0"}});if(response.status===405){response=await fetch(url,{method:"GET",redirect:"follow",signal:AbortSignal.timeout(9000),headers:{"User-Agent":"LeoMonitor/1.0","Range":"bytes=0-0"}});response.body?.cancel().catch(()=>{});}let status=response.ok?"reachable":response.status===401||response.status===403?"probe_blocked":response.status>=500?"endpoint_error":"endpoint_error";return {id,name,scope:"Pemeriksaan HTTP endpoint situs publik; bukan status seluruh server/aplikasi",status,detail:response.ok?`Situs merespons HTTP ${response.status}. Ini hanya pemeriksaan endpoint publik.`:`Endpoint membalas HTTP ${response.status}; ini tidak cukup untuk menyimpulkan seluruh layanan sedang down.`,httpStatus:response.status,latencyMs:Date.now()-started,checkedAt:new Date().toISOString(),sourceUrl:url,sourceType:"public_endpoint"};}
  catch{return {id,name,scope:"Pemeriksaan HTTP endpoint situs publik; bukan status seluruh server/aplikasi",status:"unreachable",detail:"Endpoint tidak merespons dari lokasi server monitor. Gangguan rute atau pembatasan probe juga dapat menjadi penyebab.",latencyMs:Date.now()-started,checkedAt:new Date().toISOString(),sourceUrl:url,sourceType:"public_endpoint"};}
}
async function refreshStatus(){
  if(statusPoll)return statusPoll;
  statusPoll=Promise.all([checkWhatsApp(),checkDiscord(),probeEndpoint("telegram","Telegram","https://telegram.org/"),probeEndpoint("tiktok","TikTok","https://www.tiktok.com/")]).then(services=>{statusCache=services;statusCheckedAt=new Date().toISOString();return services;}).finally(()=>{statusPoll=null;});
  return statusPoll;
}
setInterval(()=>{refreshStatus().catch(()=>{});},POLL_MS);

function decodeXml(value){return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").trim();}
function xmlTag(block,tag){const match=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,`i`));return match?decodeXml(match[1]):"";}
function imageFromItem(block){const media=block.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*\burl=["']([^"']+)["']/i),description=block.match(/<(?:description|content:encoded)(?:\s[^>]*)?>([\s\S]*?)<\/(?:description|content:encoded)>/i),embedded=description?.[1].match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i),candidate=media?decodeXml(media[1]):embedded?decodeXml(embedded[1]):"";try{const url=new URL(candidate);return url.protocol==="https:"?url.href:null;}catch{return null;}}
async function getNews(){
  if(newsCache&&Date.now()-newsCheckedAt<5*60_000)return newsCache;
  const url="https://news.google.com/rss/search?q=%22dark+web%22+OR+darknet+OR+%22darknet+market%22&hl=en-US&gl=US&ceid=US:en";
  const response=await fetch(url,{signal:AbortSignal.timeout(9000),headers:{Accept:"application/rss+xml, application/xml, text/xml","User-Agent":"LeoMonitor/1.0"}});if(!response.ok)throw new Error("RSS unavailable");const xml=await response.text();
  newsCache=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,20).map(([,block])=>{const itemUrl=xmlTag(block,"link"),parsed=new URL(itemUrl);if(parsed.protocol!=="https:")return null;return {title:xmlTag(block,"title"),url:itemUrl,image:imageFromItem(block),publishedAt:xmlTag(block,"pubDate"),source:xmlTag(block,"source")||"Google News RSS"};}).filter(item=>item&&item.title&&item.url);
  newsCheckedAt=Date.now();return newsCache;
}

const server=http.createServer(async(req,res)=>{
  if(maintenanceNow()){maintenancePage(res);return;}
  if(req.method!=="GET"&&req.method!=="HEAD"){write(res,405,"Method Not Allowed",{"Allow":"GET, HEAD"});return;}
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);}catch{write(res,400,"Bad Request");return;}
  if(pathname==="/api/monitor"){
    try{const services=statusCache||await refreshStatus();json(res,200,{checkedAt:statusCheckedAt,intervalSeconds:POLL_MS/1000,maintenance:{timeZone:WIB,start:"09:00",end:"14:00"},services});}catch{json(res,503,{error:"Status upstreams unavailable"});}return;
  }
  if(pathname==="/api/news"){
    try{json(res,200,await getNews());}catch{json(res,502,{error:"Public RSS source unavailable"});}return;
  }
  const requested=pathname==="/"?"index.html":pathname.slice(1),file=path.resolve(ROOT,requested);
  if(file!==ROOT&&!file.startsWith(ROOT+path.sep)){write(res,403,"Forbidden");return;}
  fs.readFile(file,(error,data)=>{if(error){write(res,error.code==="ENOENT"?404:500,error.code==="ENOENT"?"Not Found":"Internal Server Error");return;}write(res,200,req.method==="HEAD"?"":data,{"Content-Type":mime[path.extname(file).toLowerCase()]||"application/octet-stream"});});
});
server.listen(PORT,HOST,()=>{console.log(`Leo Monitor: http://${HOST}:${PORT}`);console.log("Daily maintenance window: 09:00–14:00 WIB");refreshStatus().catch(()=>{});});


