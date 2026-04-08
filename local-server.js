// local-server.js — draait op je laptop
// Combineert WebSocket server + muisbesturing in één proces
// Je telefoon verbindt via een Cloudflare tunnel
//
// Gebruik:
//   1. node local-server.js
//   2. cloudflared tunnel --url http://localhost:3000
//   3. Open de tunnel-URL op je telefoon

const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const robot = require("robotjs");

const PORT = process.env.PORT || 3000;
const SENSITIVITY = 1.5;
const MAX_COMMANDS_PER_SEC = 120;
const ALLOWED_TYPES = new Set(["move", "click", "rightclick", "doubleclick", "scroll"]);

robot.setMouseDelay(0);

const CODE = crypto.randomBytes(3).toString("hex").toUpperCase();

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Touchpad server draait. Verbind via WebSocket.");
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

wss.on("connection", (ws) => {
  ws._authenticated = false;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Authenticatie met sessiecode
    if (msg.type === "register") {
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
        const dir = dy > 0 ? "down" : "up";
        const amount = Math.max(1, Math.abs(Math.round(dy / 3)));
        robot.scrollMouse(0, amount * (dir === "down" ? -1 : 1));
        break;
      }
    }
  });

  ws.on("close", () => {
    if (ws === phoneWs) {
      phoneWs = null;
      console.log("Telefoon verbroken. Wacht op nieuwe verbinding...");
    }
  });
});

server.listen(PORT, () => {
  console.log("");
  console.log("============================================");
  console.log(`  Touchpad server draait op poort ${PORT}`);
  console.log("");
  console.log(`  SESSIECODE:  ${CODE}`);
  console.log("");
  console.log("  Start nu de tunnel:");
  console.log("  cloudflared tunnel --url http://localhost:3000");
  console.log("============================================");
  console.log("");
});
