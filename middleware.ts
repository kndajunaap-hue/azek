import { next } from "@vercel/functions";

const TIME_ZONE = "Asia/Jakarta";

function jakartaTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return {
    hour: Number(parts.find((part) => part.type === "hour").value),
    minute: Number(parts.find((part) => part.type === "minute").value),
  };
}

export default function middleware() {
  const { hour, minute } = jakartaTime();
  if (hour < 9 || hour >= 14) return next();

  const retryAfter = Math.max(60, ((14 - hour) * 60 - minute) * 60);
  const body = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sedang pemeliharaan</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#070b12;color:#dce7f4;font:15px system-ui"><main style="max-width:560px;padding:32px;text-align:center"><p style="color:#18d992;letter-spacing:.15em">LEO MONITOR</p><h1>Situs sedang dipelihara</h1><p>Pemeliharaan terjadwal berlangsung setiap hari pukul 09.00–14.00 WIB.</p><p style="color:#8394aa">Silakan kembali setelah pukul 14.00 WIB.</p></main><meta http-equiv="refresh" content="300"></body></html>`;

  return new Response(body, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(retryAfter),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    },
  });
}
