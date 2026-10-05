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
  try{const response=await fetch("/api/monitor",{cache:"no-store",headers:{Accept:"application/json"}});if(!response.ok)throw new Error(`HTTP ${response.status}`);renderServices(await response.json());}
  catch{$("#monitorMessage").textContent="Backend monitor tidak tersambung. Jalankan server.js untuk mengambil status langsung.";$("#overallStatus").className="overall-pill unknown";$("#overallStatus").textContent="Backend tidak tersambung";}
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
