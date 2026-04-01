const { WebSocketServer } = require("ws");

const PORT = 3000;
const ROBOT_URL = process.env.ROBOT_HELPER_URL || "http://host.docker.internal:3001";

const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server luistert op poort ${PORT}`);
console.log(`Muiscommando's worden doorgestuurd naar: ${ROBOT_URL}`);

// Stuur een muiscommando door naar de robotjs helper op de Windows host
async function sendToRobot(data) {
  try {
    await fetch(`${ROBOT_URL}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.error("Kan robotjs helper niet bereiken:", err.message);
  }
}

wss.on("connection", (ws) => {
  console.log("Telefoon verbonden!");

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      sendToRobot(msg);
    } catch (e) {
      console.error("Ongeldig bericht:", e.message);
    }
  });

  ws.on("close", () => console.log("Telefoon verbroken."));
});
