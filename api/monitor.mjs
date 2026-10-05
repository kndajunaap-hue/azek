const TIME_ZONE = "Asia/Jakarta";
const POLL_SECONDS = 60;
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, s-maxage=45, stale-while-revalidate=15",
  "X-Content-Type-Options": "nosniff",
};

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "LeoMonitor/1.0" },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
  return response.json();
}

async function checkDiscord() {
  const started = Date.now();
  const sourceUrl = "https://discordstatus.com/";
  try {
    const data = await fetchJson("https://discordstatus.com/api/v2/summary.json");
    const indicator = data.status?.indicator || "unknown";
    const states = { none: "operational", minor: "degraded", major: "outage", critical: "outage" };
    return { id: "discord", name: "Discord", scope: "Status resmi platform (Statuspage API)", status: states[indicator] || "unknown", detail: data.status?.description || "Status resmi tidak memberikan deskripsi.", latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), sourceUpdatedAt: data.page?.updated_at || null, sourceUrl, sourceType: "official_status" };
  } catch {
    return { id: "discord", name: "Discord", scope: "Status resmi platform (Statuspage API)", status: "unknown", detail: "API status resmi tidak dapat dihubungi dari server monitor.", latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), sourceUrl, sourceType: "official_status" };
  }
}

async function checkWhatsApp() {
  const started = Date.now();
  const sourceUrl = "https://metastatus.com/whatsapp-business-api";
  try {
    const base = "https://metastatus.com/data";
    const [orgs, outages] = await Promise.all([
      fetchJson(`${base}/orgs.json`),
      fetchJson(`${base}/outages/whatsapp-business-api.json`),
    ]);
    const org = orgs.find((item) => item.id === "whatsapp-business-api");
    if (!org) throw new Error("WhatsApp status data missing");
    const services = org.services || [];
    const issues = services.filter((item) => item.status && item.status.toLowerCase() !== "no known issues");
    const status = outages.length || issues.length ? "degraded" : "operational";
    const detail = outages.length
      ? `${outages.length} gangguan aktif dilaporkan.`
      : issues.length
        ? issues.map((item) => `${item.name}: ${item.status}`).join(" · ")
        : `Tidak ada gangguan yang diketahui pada ${services.length} komponen WhatsApp Business.`;
    return { id: "whatsapp", name: "WhatsApp Business Platform", scope: "Status resmi Meta; komponen Business/Cloud API", status, detail, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), sourceUpdatedAt: null, sourceUrl, sourceType: "official_status" };
  } catch {
    return { id: "whatsapp", name: "WhatsApp Business Platform", scope: "Status resmi Meta; komponen Business/Cloud API", status: "unknown", detail: "Data status Meta tidak dapat dibaca. Status WhatsApp pribadi tidak tercakup halaman ini.", latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), sourceUrl, sourceType: "official_status" };
  }
}

async function probeEndpoint(id, name, url) {
  const started = Date.now();
  const options = { redirect: "follow", signal: AbortSignal.timeout(9000), headers: { "User-Agent": "LeoMonitor/1.0" } };
  try {
    let response = await fetch(url, { ...options, method: "HEAD" });
    if (response.status === 405) {
      response = await fetch(url, { ...options, method: "GET", headers: { ...options.headers, Range: "bytes=0-0" } });
      response.body?.cancel().catch(() => {});
    }
    const status = response.ok ? "reachable" : response.status === 401 || response.status === 403 ? "probe_blocked" : "endpoint_error";
    return { id, name, scope: "Pemeriksaan HTTP endpoint situs publik; bukan status seluruh server/aplikasi", status, detail: response.ok ? `Situs merespons HTTP ${response.status}. Ini hanya pemeriksaan endpoint publik.` : `Endpoint membalas HTTP ${response.status}; ini tidak cukup untuk menyimpulkan seluruh layanan sedang down.`, httpStatus: response.status, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), sourceUrl: url, sourceType: "public_endpoint" };
  } catch {
    return { id, name, scope: "Pemeriksaan HTTP endpoint situs publik; bukan status seluruh server/aplikasi", status: "unreachable", detail: "Endpoint tidak merespons dari lokasi server monitor. Gangguan rute atau pembatasan probe juga dapat menjadi penyebab.", latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), sourceUrl: url, sourceType: "public_endpoint" };
  }
}

async function handle(request) {
  const services = await Promise.all([
    checkWhatsApp(),
    checkDiscord(),
    probeEndpoint("telegram", "Telegram", "https://telegram.org/"),
    probeEndpoint("tiktok", "TikTok", "https://www.tiktok.com/"),
  ]);
  const payload = JSON.stringify({
    checkedAt: new Date().toISOString(),
    intervalSeconds: POLL_SECONDS,
    maintenance: { timeZone: TIME_ZONE, start: "09:00", end: "14:00" },
    services,
  });
  return new Response(request.method === "HEAD" ? null : payload, { status: 200, headers: HEADERS });
}

export const GET = handle;
export const HEAD = handle;
