# Touchpad App — Docker setup

## Projectstructuur

```
touchpad-docker/
├── docker-compose.yml
├── robot-helper.js          ← draait BUITEN Docker op Windows
├── public/
│   └── index.html           ← frontend voor op je telefoon
└── ws-server/
    ├── Dockerfile
    ├── package.json
    └── server.js
```

## Opstarten

### Stap 1 — Installeer robotjs helper (eenmalig)
```bash
npm install robotjs
```
> Als dit mislukt: installeer eerst Visual Studio Build Tools
> https://visualstudio.microsoft.com/downloads/

### Stap 2 — Start de robotjs helper op Windows
```bash
node robot-helper.js
```
Laat dit venster open staan!

### Stap 3 — Start Docker containers
```bash
docker-compose up --build
```

### Stap 4 — Open op je telefoon
Zorg dat je telefoon op hetzelfde WiFi-netwerk zit, en open:
```
http://<jouw-pc-ip>:80
```
Vind je PC IP-adres met: `ipconfig` → zoek "IPv4 Address"

## Hoe het werkt

1. Telefoon laadt de HTML van nginx (poort 80)
2. Telefoon maakt WebSocket verbinding met ws-server (poort 3000)
3. ws-server stuurt commando's door naar robot-helper (localhost:3001)
4. robot-helper beweegt de muis via robotjs
