# Remote Terminal

Control your Windows PC terminal from your phone, anywhere over the internet.

## Architecture

```
Phone browser (xterm.js UI)
      ↕ WSS
Coolify relay server (Node.js + WebSocket)
      ↕ WSS (outbound from PC)
PC agent (Node.js + node-pty)
      ↕
PowerShell
```

No port forwarding required — the PC agent connects *outbound* to the relay.

---

## Quickstart

### 1. Generate a token

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save this as your `AGENT_TOKEN`.

### 2. Deploy the relay (Coolify)

- Connect this repo to a new Coolify application (uses the Dockerfile)
- Set environment variable: `AGENT_TOKEN=<your-token>`
- Note the deployed URL, e.g. `https://terminal.148.230.100.16.sslip.io`

### 3. Run the PC desktop app

```bash
cd pc-app
cp .env.example .env
# Edit .env: set RELAY_HTTP_URL, RELAY_WS_URL, AGENT_TOKEN
npm install
npm start
```

This opens a desktop window showing your terminal and starts the agent automatically.

### 4. Phone access

Navigate to `https://<relay-url>` in your phone browser.
Enter your `AGENT_TOKEN` when prompted — it's saved to localStorage.

---

## Manual agent (no Electron)

```bash
cd agent
npm install
# Set env vars or create .env
RELAY_URL=wss://terminal.148.230.100.16.sslip.io AGENT_TOKEN=<token> node agent.js
```
