const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
  "X-Content-Type-Options": "nosniff",
};

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

function xmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function imageFromItem(block) {
  const media = block.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*\burl=["']([^"']+)["']/i);
  const description = block.match(/<(?:description|content:encoded)(?:\s[^>]*)?>([\s\S]*?)<\/(?:description|content:encoded)>/i);
  const embedded = description?.[1].match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  const candidate = media ? decodeXml(media[1]) : embedded ? decodeXml(embedded[1]) : "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

async function handle(request) {
  try {
    const url = "https://news.google.com/rss/search?q=%22dark+web%22+OR+darknet+OR+%22darknet+market%22&hl=en-US&gl=US&ceid=US:en";
    const response = await fetch(url, {
      signal: AbortSignal.timeout(9000),
      headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "LeoMonitor/1.0" },
    });
    if (!response.ok) throw new Error("RSS unavailable");
    const xml = await response.text();
    const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
      .slice(0, 20)
      .map(([, block]) => {
        const itemUrl = xmlTag(block, "link");
        try {
          if (new URL(itemUrl).protocol !== "https:") return null;
        } catch {
          return null;
        }
        return { title: xmlTag(block, "title"), url: itemUrl, image: imageFromItem(block), publishedAt: xmlTag(block, "pubDate"), source: xmlTag(block, "source") || "Google News RSS" };
      })
      .filter((item) => item && item.title && item.url);
    return new Response(request.method === "HEAD" ? null : JSON.stringify(items), { status: 200, headers: HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Public RSS source unavailable" }), {
      status: 502,
      headers: { ...HEADERS, "Cache-Control": "no-store" },
    });
  }
}

export const GET = handle;
export const HEAD = handle;
