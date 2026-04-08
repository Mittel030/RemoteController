// local-agent.js — draait DIRECT op je laptop, NIET in Docker
// Maakt een uitgaande WebSocket verbinding naar de cloud server
// en stuurt muiscommando's door naar robotjs
//
// Gebruik:
//   set SERVER_URL=wss://jouw-school-domein.nl
//   node local-agent.js

const WebSocket = require("ws");
const robot = require("robotjs");
const crypto = require("crypto");

// === CONFIGURATIE ===
const SERVER_URL = process.env.SERVER_URL || "ws://localhost:3000";
const SENSITIVITY = 1.5;
// ====================

robot.setMouseDelay(0);

const CODE = crypto.randomBytes(3).toString("hex").toUpperCase();

let ws = null;
let reconnectTimer = null;

function connect() {
  console.log(`\nVerbinden met server: ${SERVER_URL}`);

  ws = new WebSocket(SERVER_URL);

  ws.on("open", () => {
    console.log("Verbonden met server!");
    ws.send(JSON.stringify({ type: "register", role: "agent", code: CODE }));
  });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "registered":
        console.log("");
        console.log("========================================");
        console.log(`  SESSIECODE:  ${msg.code}`);
        console.log("  Voer deze code in op je telefoon");
        console.log("========================================");
        console.log("");
        break;

      case "paired":
        console.log("Telefoon gekoppeld! Muisbesturing actief.");
        break;

      case "disconnected":
        console.log(`${msg.who} heeft de verbinding verbroken.`);
        break;

      case "error":
        console.error(`Fout: ${msg.message}`);
        break;

      case "move": {
        const pos = robot.getMousePos();
        const newX = Math.round(pos.x + msg.dx * SENSITIVITY);
        const newY = Math.round(pos.y + msg.dy * SENSITIVITY);
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
        const dir = msg.dy > 0 ? "down" : "up";
        const amount = Math.max(1, Math.abs(Math.round(msg.dy / 3)));
        robot.scrollMouse(0, amount * (dir === "down" ? -1 : 1));
        break;
      }
    }
  });

  ws.on("close", () => {
    console.log("Verbinding verbroken. Opnieuw proberen over 3 seconden...");
    reconnectTimer = setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    console.error("WebSocket fout:", err.message);
  });
}

process.on("SIGINT", () => {
  console.log("\nAgent gestopt.");
  if (ws) ws.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  process.exit(0);
});

connect();
