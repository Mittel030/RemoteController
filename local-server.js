// local-server.js — draait op je laptop
// Alles-in-één: WebSocket server + muisbesturing + automatische Cloudflare tunnel
// Start met:  node local-server.js
// En open de getoonde link op je telefoon — klaar!

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, exec } = require("child_process");
const { WebSocketServer } = require("ws");
const robot = require("robotjs");

const PORT = process.env.PORT || 3000;
const PHONE_DOMAIN = process.env.PHONE_DOMAIN || "https://u240913.gluwebsite.nl/RemoteController";
const SENSITIVITY = 1.5;
const MAX_COMMANDS_PER_SEC = 120;
const ALLOWED_TYPES = new Set(["move", "click", "rightclick", "doubleclick", "scroll", "mousedown", "mouseup", "dragmove"]);

robot.setMouseDelay(0);

const CODE = crypto.randomBytes(3).toString("hex").toUpperCase();

// Dashboard clients (browser op laptop)
const dashboardClients = new Set();
let tunnelPhoneUrl = null;

function broadcastDashboard(msg) {
  const data = JSON.stringify(msg);
  for (const c of dashboardClients) {
    if (c.readyState === 1) c.send(data);
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const dashPath = path.join(__dirname, "dashboard.html");
    fs.readFile(dashPath, (err, data) => {
      if (err) { res.writeHead(500); res.end("Dashboard niet gevonden"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

const wss = new WebSocketServer({ server });

let phoneWs = null;

function rateLimited(ws) {
  const now = Date.now();
  if (!ws._cmdTimes) ws._cmdTimes = [];
  ws._cmdTimes = ws._cmdTimes.filter(t => now - t < 1000);
  if (ws._cmdTimes.length >= MAX_COMMANDS_PER_SEC) return true;
  ws._cmdTimes.push(now);
  return false;
}

wss.on("connection", (ws, req) => {
  ws._authenticated = false;
  ws._isDashboard = false;

  // Eerste bericht bepaalt of het een dashboard of telefoon is
  // Dashboard stuurt geen register bericht — we detecteren op basis van
  // of er binnen 2 sec een register binnenkomt
  const dashboardTimer = setTimeout(() => {
    if (!ws._authenticated && !ws._isDashboard) {
      // Geen register ontvangen = dashboard client
      ws._isDashboard = true;
      dashboardClients.add(ws);
      ws.send(JSON.stringify({ type: "dashboard-init", code: CODE }));
      if (tunnelPhoneUrl) {
        ws.send(JSON.stringify({ type: "tunnel-ready", phoneUrl: tunnelPhoneUrl }));
      }
      if (phoneWs && phoneWs.readyState === 1) {
        ws.send(JSON.stringify({ type: "phone-connected" }));
      }
    }
  }, 500);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Authenticatie met sessiecode
    if (msg.type === "register") {
      clearTimeout(dashboardTimer);
      const code = String(msg.code || "").trim().toUpperCase();
      if (code !== CODE) {
        ws.send(JSON.stringify({ type: "error", message: "Ongeldige sessiecode" }));
        ws.close();
        return;
      }
      if (phoneWs && phoneWs.readyState === 1) {
        ws.send(JSON.stringify({ type: "error", message: "Er is al een telefoon verbonden" }));
        ws.close();
        return;
      }
      ws._authenticated = true;
      phoneWs = ws;
      ws.send(JSON.stringify({ type: "paired" }));
      broadcastDashboard({ type: "phone-connected" });
      console.log("Telefoon gekoppeld! Muisbesturing actief.");
      return;
    }

    // Alleen geauthenticeerde verbindingen mogen commando's sturen
    if (!ws._authenticated) return;
    if (!ALLOWED_TYPES.has(msg.type)) return;
    if (rateLimited(ws)) return;

    switch (msg.type) {
      case "move": {
        const pos = robot.getMousePos();
        const newX = Math.round(pos.x + (msg.dx || 0) * SENSITIVITY);
        const newY = Math.round(pos.y + (msg.dy || 0) * SENSITIVITY);
        robot.moveMouse(newX, newY);
        break;
      }
      case "click":
        robot.mouseClick("left");
        break;
      case "rightclick":
        robot.mouseClick("right");
        break;
      case "doubleclick":
        robot.mouseClick("left", true);
        break;
      case "scroll": {
        const dy = msg.dy || 0;
        const amount = Math.max(1, Math.abs(Math.round(dy / 3)));
        // robotjs scrollMouse: positief = omhoog, negatief = omlaag
        // telefoon dy positief = vinger omlaag = pagina omlaag = negatieve scroll
        robot.scrollMouse(0, dy > 0 ? -amount : amount);
        break;
      }
      case "mousedown":
        robot.mouseToggle("down", "left");
        break;
      case "mouseup":
        robot.mouseToggle("up", "left");
        break;
      case "dragmove": {
        const pos = robot.getMousePos();
        const newX = Math.round(pos.x + (msg.dx || 0) * SENSITIVITY);
        const newY = Math.round(pos.y + (msg.dy || 0) * SENSITIVITY);
        robot.moveMouse(newX, newY);
        break;
      }
    }
  });

  ws.on("close", () => {
    if (ws._isDashboard) {
      dashboardClients.delete(ws);
    }
    if (ws === phoneWs) {
      phoneWs = null;
      broadcastDashboard({ type: "phone-disconnected" });
      console.log("Telefoon verbroken. Wacht op nieuwe verbinding...");
    }
  });
});

server.listen(PORT, () => {
  console.log(`Touchpad server draait op http://localhost:${PORT}`);
  console.log(`Sessiecode: ${CODE}`);
  console.log("Cloudflare tunnel starten...");

  // Open dashboard in browser
  const openCmd = process.platform === "win32" ? "start" :
                  process.platform === "darwin" ? "open" : "xdg-open";
  exec(`${openCmd} http://localhost:${PORT}`);

  startTunnel();
});

// === Cloudflare tunnel automatisch starten ===
function startTunnel() {
  const cf = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${PORT}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let tunnelUrl = null;

  function parseLine(line) {
    if (tunnelUrl) return;
    // cloudflared logt de URL in stderr
    const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      tunnelUrl = match[0];
      const wsUrl = tunnelUrl.replace("https://", "wss://");
      tunnelPhoneUrl = `${PHONE_DOMAIN}/?server=${encodeURIComponent(wsUrl)}&code=${CODE}`;

      broadcastDashboard({ type: "tunnel-ready", phoneUrl: tunnelPhoneUrl });

      console.log("");
      console.log("Tunnel actief!");
      console.log(`Telefoon link: ${tunnelPhoneUrl}`);
      console.log("");
      printQR(tunnelPhoneUrl);
      console.log("");
      console.log("  Of scan de QR-code hierboven met je telefoon camera");
      console.log("");
    }
  }

  cf.stderr.on("data", (data) => {
    data.toString().split("\n").forEach(parseLine);
  });

  cf.stdout.on("data", (data) => {
    data.toString().split("\n").forEach(parseLine);
  });

  cf.on("error", (err) => {
    broadcastDashboard({ type: "tunnel-error" });
    console.error("cloudflared niet gevonden! Download: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
  });

  cf.on("close", (code) => {
    if (code !== 0 && !tunnelUrl) {
      console.error("  Tunnel gestopt. Herstart het programma.");
    }
  });

  process.on("SIGINT", () => {
    cf.kill();
    process.exit();
  });
}

// === QR-code in terminal (compact) ===
function printQR(text) {
  // Simpele QR encoding via bit matrix
  // We gebruiken een minimale QR generator
  try {
    const qr = generateQR(text);
    if (!qr) return;
    // Gebruik Unicode block chars: ██ = zwart, "  " = wit
    // Twee rijen per lijn met ▀ ▄ █ en spatie
    const size = qr.length;
    for (let y = 0; y < size; y += 2) {
      let line = "    ";
      for (let x = 0; x < size; x++) {
        const top = qr[y][x];
        const bottom = (y + 1 < size) ? qr[y + 1][x] : false;
        if (top && bottom) line += "█";
        else if (top && !bottom) line += "▀";
        else if (!top && bottom) line += "▄";
        else line += " ";
      }
      console.log(line);
    }
  } catch (e) {
    // QR generatie mislukt, niet erg — link is al getoond
  }
}

// Minimale QR Code generator (versie 1-6, alphanumeric/byte mode)
// Gebaseerd op publieke specificatie, vereenvoudigd voor terminal output
function generateQR(text) {
  try {
    // Probeer qrcode-terminal als het beschikbaar is
    const mod = require("qrcode-terminal");
    mod.generate(text, { small: true }, (code) => {
      code.split("\n").forEach(line => console.log("    " + line));
    });
    return null; // al geprint
  } catch {
    // Geen QR library beschikbaar, sla over
    console.log("  (Installeer 'qrcode-terminal' voor QR-code: npm i qrcode-terminal)");
    return null;
  }
}
