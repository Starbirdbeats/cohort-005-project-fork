// PROTOTYPE — throwaway. Serves the notification hi-fi tweaker and saves each
// tab's values into notification-hifi-tokens.json next to this file.
// Run: node docs/prototypes/hifi-tweaker-server.mjs   (then open http://localhost:5199)
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = join(here, "notification-hifi-tweaker.html");
const TOKENS = join(here, "notification-hifi-tokens.json");
const PORT = Number(process.env.PORT ?? 5199);

async function readTokens() {
  try {
    return JSON.parse(await readFile(TOKENS, "utf8"));
  } catch {
    return { tabs: {} };
  }
}

http
  .createServer(async (req, res) => {
    console.log(new Date().toISOString(), req.method, req.url, req.headers.origin ?? "");
    // The browser pane may open the HTML as a file:// page; let it reach us.
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    try {
      if (req.method === "GET" && (req.url === "/" || req.url?.startsWith("/?"))) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(await readFile(PAGE));
        return;
      }
      if (req.method === "GET" && req.url === "/tokens") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(await readTokens()));
        return;
      }
      if (req.method === "POST" && req.url === "/save") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { tab, name, values } = JSON.parse(body);
        if (typeof tab !== "string" || typeof values !== "object") throw new Error("bad payload");
        const tokens = await readTokens();
        tokens.tabs[tab] = { name, values, savedAt: new Date().toISOString() };
        await writeFile(TOKENS, JSON.stringify(tokens, null, 2) + "\n");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(tokens));
        return;
      }
      res.writeHead(404).end("not found");
    } catch (err) {
      res.writeHead(400).end(String(err));
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`hi-fi tweaker on http://localhost:${PORT}`));
