'use strict';

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3000;
const AGENT_TOKEN = process.env.AGENT_TOKEN;

if (!AGENT_TOKEN) {
  console.error('ERROR: AGENT_TOKEN environment variable is required');
  process.exit(1);
}

const app = express();

// Serve static browser UI
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

// WebSocket server (handles all WS upgrades)
const wss = new WebSocketServer({ noServer: true });

// Track connected sockets
let agentSocket = null;
const browserSockets = new Set();

// Parse token from URL query string
function getToken(req) {
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('token');
}

// Send a JSON status message to a socket (best-effort)
function sendStatus(ws, message) {
  if (ws && ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify({ type: 'status', message }));
    } catch (_) {}
  }
}

// Broadcast to all open browser sockets
function broadcastToBrowsers(data) {
  for (const ws of browserSockets) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(data);
      } catch (_) {}
    }
  }
}

// Handle upgrade manually so we can inspect the path
server.on('upgrade', function (req, socket, head) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (token !== AGENT_TOKEN) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, function (ws) {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', function (ws, req) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // ── AGENT connection ──────────────────────────────────────────────────────
  if (pathname === '/ws/agent') {
    console.log('[relay] Agent connected');

    // Kick previous agent if one is already connected
    if (agentSocket && agentSocket.readyState === agentSocket.OPEN) {
      console.log('[relay] Kicking previous agent connection');
      agentSocket.close(4000, 'replaced by new agent');
    }

    agentSocket = ws;
    broadcastToBrowsers(JSON.stringify({ type: 'status', message: 'Agent connected — terminal ready' }));

    // Forward agent output → all browsers (raw binary/text)
    ws.on('message', function (data) {
      broadcastToBrowsers(data);
    });

    ws.on('close', function () {
      console.log('[relay] Agent disconnected');
      if (agentSocket === ws) agentSocket = null;
      broadcastToBrowsers(JSON.stringify({ type: 'status', message: 'Agent disconnected — waiting for reconnect…' }));
    });

    ws.on('error', function (err) {
      console.error('[relay] Agent socket error:', err.message);
    });

    return;
  }

  // ── BROWSER connection ────────────────────────────────────────────────────
  if (pathname === '/ws/browser') {
    console.log('[relay] Browser connected');
    browserSockets.add(ws);

    // Tell browser current agent state
    if (!agentSocket || agentSocket.readyState !== agentSocket.OPEN) {
      sendStatus(ws, 'Waiting for agent to connect…');
    } else {
      sendStatus(ws, 'Agent connected — terminal ready');
    }

    // Forward browser keystrokes → agent
    ws.on('message', function (data) {
      if (agentSocket && agentSocket.readyState === agentSocket.OPEN) {
        try {
          agentSocket.send(data);
        } catch (_) {}
      }
    });

    ws.on('close', function () {
      console.log('[relay] Browser disconnected');
      browserSockets.delete(ws);
    });

    ws.on('error', function (err) {
      console.error('[relay] Browser socket error:', err.message);
    });

    return;
  }

  // Unknown path — close immediately
  ws.close(4004, 'Unknown path');
});

server.listen(PORT, function () {
  console.log('[relay] Listening on port ' + PORT);
});
