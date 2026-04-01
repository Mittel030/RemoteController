// robot-helper.js — draait DIRECT op Windows, NIET in Docker
// Start met: node robot-helper.js

const http = require("http");
const robot = require("robotjs");

const PORT = 3001;
const SENSITIVITY = 1.5;

robot.setMouseDelay(0); // Geen vertraging voor vloeiende beweging

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/command") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const msg = JSON.parse(body);

        switch (msg.type) {
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

        res.writeHead(200);
        res.end("ok");
      } catch (e) {
        console.error("Fout:", e.message);
        res.writeHead(400);
        res.end("error");
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n✅ robotjs helper draait op localhost:${PORT}`);
  console.log(`   Wacht op muiscommando's van de Docker WS server...\n`);
});
