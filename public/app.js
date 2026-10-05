const $ = selector => document.querySelector(selector);
const STATUS_REFRESH_MS = 60_000;
const NEWS_REFRESH_MS = 5 * 60_000;
const serviceGrid = $("#serviceGrid");
const statusButton = $("#refreshStatus");
let statusBusy = false;

const STATUS_TEXT = {
  operational: "Operasional",
  degraded: "Gangguan / degradasi dilaporkan",
  outage: "Gangguan besar dilaporkan",
  reachable: "Endpoint publik merespons",
  probe_blocked: "Probe dibatasi oleh endpoint",
  endpoint_error: "Endpoint mengembalikan error",
  unreachable: "Endpoint tidak merespons",
  unknown: "Status belum diketahui"
};

function localTime(value){
  if(!value) return "—";
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"medium"}).format(date)+" WIB";
}
function statusClass(value){return STATUS_TEXT[value]?value:"unknown";}
function make(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function renderServices(payload){
  serviceGrid.replaceChildren();
  for(const service of payload.services||[]){
    const card=make("article","service-card");
    const head=make("div","service-head"),titleWrap=make("div");
    titleWrap.append(make("h2","service-name",service.name),make("p","service-scope",service.scope));
    const pill=make("span",`status-pill ${statusClass(service.status)}`,STATUS_TEXT[service.status]||STATUS_TEXT.unknown);
    head.append(titleWrap,pill);
    const detail=make("p","service-detail",service.detail||"Tidak ada detail dari sumber.");
    const meta=make("div","service-meta");
    meta.append(make("span","",`Diperiksa: ${localTime(service.checkedAt||payload.checkedAt)}`));
    if(Number.isFinite(service.latencyMs))meta.append(make("span","",`Latensi monitor: ${service.latencyMs} ms`));
    if(service.sourceUpdatedAt)meta.append(make("span","",`Sumber diperbarui: ${localTime(service.sourceUpdatedAt)}`));
    const source=make("a","","Sumber resmi ↗");source.href=service.sourceUrl;source.target="_blank";source.rel="noopener noreferrer";meta.append(source);
    card.append(head,detail,meta);serviceGrid.append(card);
  }
  const values=(payload.services||[]).map(item=>item.status);
  const issueCount=values.filter(value=>["degraded","outage","endpoint_error","unreachable"].includes(value)).length;
  const unknownCount=values.filter(value=>value==="unknown"||value==="probe_blocked").length;
  const overall=$("#overallStatus");
  overall.className=`overall-pill ${issueCount?"degraded":unknownCount?"unknown":"operational"}`;
  overall.textContent=issueCount?`${issueCount} perlu perhatian`:unknownCount?"Ada status tidak pasti":"Sumber terpantau tersedia";
  $("#lastChecked").textContent=`Pemeriksaan ${localTime(payload.checkedAt)}`;
  $("#monitorMessage").textContent=`${payload.services.length} layanan · sumber diperiksa server · interval ${payload.intervalSeconds} detik`;
}
async function loadStatus(){
  if(statusBusy)return;statusBusy=true;statusButton.disabled=true;statusButton.textContent="Memeriksa…";
  try{const response=await fetch("/api/monitor",{cache:"no-store",headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);const payload=await response.json();if(!Array.isArray(payload.services))throw new Error("Invalid monitor response");renderServices(payload);}
  catch(error){$("#monitorMessage").textContent=error.name==="TimeoutError"?"Monitor melewati batas waktu. Coba periksa lagi.":"Backend monitor tidak tersambung. Untuk lokal, jalankan npm start; di Vercel periksa Function Logs.";$("#overallStatus").className="overall-pill unknown";$("#overallStatus").textContent="Backend tidak tersambung";}
  finally{statusBusy=false;statusButton.disabled=false;statusButton.textContent="↻ Periksa sekarang";}
}

async function loadNews(){
  const status=$("#newsStatus"),list=$("#newsList"),button=$("#refreshNews");button.disabled=true;status.textContent="Memuat berita dari RSS publik…";
  try{
    const response=await fetch("/api/news",{cache:"no-store",headers:{Accept:"application/json"}});if(!response.ok)throw new Error("news endpoint unavailable");
    const items=await response.json(),fragment=document.createDocumentFragment();
    for(const item of items){const article=make("article","news-item"),link=make("a","",item.title);link.href=item.url;link.target="_blank";link.rel="noopener noreferrer";const meta=make("small","",[item.source,item.publishedAt?localTime(item.publishedAt):""].filter(Boolean).join(" · "));article.append(link,meta);fragment.append(article);}
    list.replaceChildren(fragment);status.textContent=items.length?`${items.length} berita publik · diperbarui ${localTime(new Date().toISOString())}`:"RSS tidak mengembalikan berita saat ini.";
  }catch{list.replaceChildren();status.textContent="Backend atau sumber RSS belum dapat diakses.";}
  finally{button.disabled=false;}
}

for(const tab of document.querySelectorAll(".tab"))tab.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(node=>node.classList.toggle("active",node===tab));document.querySelectorAll(".view").forEach(view=>view.classList.toggle("active",view.id===`view-${tab.dataset.view}`));});
statusButton.addEventListener("click",loadStatus);
$("#refreshNews").addEventListener("click",loadNews);
loadStatus();loadNews();
setInterval(loadStatus,STATUS_REFRESH_MS);
setInterval(loadNews,NEWS_REFRESH_MS);

/* Local lab demos: these controls never call a target or send network traffic. */
const labPanels=[...document.querySelectorAll(".lab-panel")];
for(const button of document.querySelectorAll(".lab-tab"))button.addEventListener("click",()=>{
  document.querySelectorAll(".lab-tab").forEach(item=>item.classList.toggle("active",item===button));
  labPanels.forEach(panel=>panel.classList.toggle("active",panel.id===`lab-${button.dataset.lab}`));
  if(button.dataset.lab==="war")setTimeout(()=>window.dispatchEvent(new Event("labs-map-visible")),0);
});
for(const tab of document.querySelectorAll(".tab"))tab.addEventListener("click",()=>{if(tab.dataset.view==="labs")setTimeout(()=>window.dispatchEvent(new Event("labs-map-visible")),0);});

const demoFindings=[
  {severity:"HIGH",title:"Contoh header keamanan tidak ada",endpoint:"/",cvss:"7.1"},
  {severity:"MEDIUM",title:"Contoh cookie tanpa SameSite",endpoint:"/login",cvss:"5.4"},
  {severity:"LOW",title:"Contoh banner versi terlihat",endpoint:"/",cvss:"3.1"},
  {severity:"INFO",title:"Contoh direktori robots.txt",endpoint:"/robots.txt",cvss:"0.0"}
];
function cell(row,text){const node=document.createElement("td");node.textContent=text;row.append(node);return node;}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
$("#scanBtn").addEventListener("click",async()=>{
  const target=$("#scanTarget").value.trim(),mode=$("#scanMode").value,status=$("#scanStatus"),bar=$("#scanBar"),button=$("#scanBtn");
  if(!target){status.textContent="Masukkan nama target contoh untuk label simulasi.";return;}
  button.disabled=true;bar.style.width="0%";status.textContent=`Menjalankan simulasi lokal untuk ${target}…`;
  for(let i=1;i<=4;i++){await sleep(250);bar.style.width=`${i*25}%`;}
  const count=mode==="quick"?2:mode==="login"?2:mode==="api"?3:demoFindings.length,rows=demoFindings.slice(0,count).map(f=>{const tr=document.createElement("tr");cell(tr,f.severity);cell(tr,f.title);cell(tr,f.endpoint);cell(tr,f.cvss);cell(tr,"CONTOH");return tr;});
  $("#scanResults").replaceChildren(...rows);status.textContent=`${rows.length} contoh temuan ditampilkan untuk ${target}. Tidak ada request jaringan yang dikirim.`;button.disabled=false;
});
$("#scanClear").addEventListener("click",()=>{$("#scanResults").replaceChildren();$("#scanBar").style.width="0%";$("#scanStatus").textContent="Hasil lokal dibersihkan.";});

$("#siteAuditBtn").addEventListener("click",async()=>{
  const button=$("#siteAuditBtn"),status=$("#siteAuditStatus"),body=$("#siteAuditResults");
  button.disabled=true;status.textContent="Memeriksa header situs ini…";
  try{
    const response=await fetch(`${location.origin}/`,{method:"HEAD",cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(10000)});
    const headers=response.headers,hasCsp=headers.has("content-security-policy"),hasFrame=headers.has("x-frame-options")||/frame-ancestors/i.test(headers.get("content-security-policy")||"");
    const checks=[
      ["Content-Security-Policy",headers.has("content-security-policy"),"Membatasi sumber skrip, konten, dan frame."],
      ["Strict-Transport-Security",location.protocol!=="https:"||headers.has("strict-transport-security"),location.protocol!=="https:"?"Tidak berlaku pada koneksi HTTP.":"Meminta browser memakai HTTPS."],
      ["X-Content-Type-Options",headers.get("x-content-type-options")==="nosniff","Mencegah browser menebak tipe konten."],
      ["Proteksi framing",hasFrame,"X-Frame-Options atau CSP frame-ancestors."],
      ["Referrer-Policy",headers.has("referrer-policy"),"Mengatur informasi referrer yang dibagikan."],
      ["Permissions-Policy",headers.has("permissions-policy"),"Membatasi fitur browser yang dapat digunakan."],
    ];
    const rows=checks.map(([name,ok,note])=>{const tr=document.createElement("tr");cell(tr,ok?"ADA":"PERLU DICEK");cell(tr,name);cell(tr,note);tr.className=ok?"audit-ok":"audit-missing";return tr;});
    body.replaceChildren(...rows);const missing=checks.filter(([,ok])=>!ok).length;
    status.textContent=`Situs diperiksa: ${new URL(location.origin).host} · ${missing?`${missing} header perlu ditinjau`:"header yang diperiksa tersedia"}. Pemeriksaan pasif saja.`;
  }catch(error){body.replaceChildren();status.textContent=error.name==="TimeoutError"?"Pemeriksaan melewati batas waktu. Coba lagi.":"Header situs tidak dapat dibaca. Jalankan dari hosting situs, bukan file://.";}
  finally{button.disabled=false;}
});

const samplePorts=[[443,"TCP","OPEN (CONTOH)","HTTPS"],[80,"TCP","OPEN (CONTOH)","HTTP"],[22,"TCP","FILTERED (CONTOH)","SSH"]];
$("#srvBtn").addEventListener("click",async()=>{const target=$("#srvTarget").value.trim(),button=$("#srvBtn");if(!target){$("#srvStatus").textContent="Masukkan label host contoh.";return;}button.disabled=true;$("#srvBar").style.width="0%";for(let i=1;i<=4;i++){await sleep(200);$("#srvBar").style.width=`${i*25}%`;}const rows=samplePorts.map(([port,protocol,status,service])=>{const tr=document.createElement("tr");cell(tr,String(port));cell(tr,protocol);cell(tr,status);cell(tr,service);return tr;});$("#srvResults").replaceChildren(...rows);$("#srvStatus").textContent=`Data contoh ditampilkan untuk ${target}. Tidak ada host yang dipindai.`;button.disabled=false;});

$("#previewBtn").addEventListener("click",()=>{$("#previewFrame").srcdoc=$("#previewHtml").value;});
const pluginNames=["DDoS Map Visualizer","Vulnerability Scan Lab","Server Scan Lab","HTML Preview","Public Status Monitor"];
$("#plugGrid").replaceChildren(...pluginNames.map(name=>{const label=document.createElement("label");label.className="plugin-item";const title=document.createElement("span");title.textContent=name;const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=true;checkbox.addEventListener("change",()=>term(`${name} :: ${checkbox.checked?"on":"off"}`,"in"));label.append(title,checkbox);return label;}));
