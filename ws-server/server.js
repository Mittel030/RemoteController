const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const path = require("path");

const PORT = process.env.PORT || 3000;
const MAX_COMMANDS_PER_SEC = 120;
const ALLOWED_TYPES = new Set(["move", "click", "rightclick", "doubleclick", "scroll", "mousedown", "mouseup", "dragmove"]);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// Rooms: code -> { agent: ws, phone: ws }
const rooms = new Map();

function rateLimited(ws) {
  const now = Date.now();
  if (!ws._cmdTimes) ws._cmdTimes = [];
  ws._cmdTimes = ws._cmdTimes.filter(t => now - t < 1000);
  if (ws._cmdTimes.length >= MAX_COMMANDS_PER_SEC) return true;
  ws._cmdTimes.push(now);
  return false;
}

wss.on("connection", (ws) => {
  ws._role = null;
  ws._code = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Registratie
    if (msg.type === "register") {
      const code = String(msg.code || "").trim().toUpperCase();
      if (!code || code.length < 4 || code.length > 10) {
        ws.send(JSON.stringify({ type: "error", message: "Ongeldige code" }));
        return;
      }

      if (msg.role === "agent") {
        if (rooms.has(code) && rooms.get(code).agent) {
          ws.send(JSON.stringify({ type: "error", message: "Code al in gebruik" }));
          return;
        }
        if (!rooms.has(code)) rooms.set(code, { agent: null, phone: null });
        rooms.get(code).agent = ws;
        ws._role = "agent";
        ws._code = code;
        ws.send(JSON.stringify({ type: "registered", code }));
        console.log(`Agent geregistreerd: ${code}`);

        if (rooms.get(code).phone) {
          ws.send(JSON.stringify({ type: "paired" }));
          rooms.get(code).phone.send(JSON.stringify({ type: "paired" }));
        }
      } else if (msg.role === "phone") {
        const room = rooms.get(code);
        if (!room || !room.agent) {
          ws.send(JSON.stringify({ type: "error", message: "Code niet gevonden. Start eerst de agent op je laptop." }));
          return;
        }
        if (room.phone) {
          ws.send(JSON.stringify({ type: "error", message: "Er is al een telefoon verbonden" }));
          return;
        }
        room.phone = ws;
        ws._role = "phone";
        ws._code = code;
        ws.send(JSON.stringify({ type: "paired" }));
        room.agent.send(JSON.stringify({ type: "paired" }));
        console.log(`Telefoon gekoppeld: ${code}`);
      }
      return;
    }

    // Commando's doorsturen van telefoon naar agent
    if (ws._role === "phone" && ws._code) {
      if (!ALLOWED_TYPES.has(msg.type)) return;
      if (rateLimited(ws)) return;
      const room = rooms.get(ws._code);
      if (room && room.agent && room.agent.readyState === 1) {
        room.agent.send(JSON.stringify(msg));
      }
    }
  });

  ws.on("close", () => {
    if (ws._code && rooms.has(ws._code)) {
      const room = rooms.get(ws._code);
      if (ws._role === "agent") {
        if (room.phone) room.phone.send(JSON.stringify({ type: "disconnected", who: "agent" }));
        rooms.delete(ws._code);
        console.log(`Agent ${ws._code} verbroken, room verwijderd`);
      } else if (ws._role === "phone") {
        room.phone = null;
        if (room.agent) room.agent.send(JSON.stringify({ type: "disconnected", who: "phone" }));
        console.log(`Telefoon ${ws._code} verbroken`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Touchpad server draait op poort ${PORT}`);
});
