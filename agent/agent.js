require('dotenv').config();

var WebSocket = require('ws');
var pty = require('node-pty');

var RELAY_URL = process.env.RELAY_URL;
var AGENT_TOKEN = process.env.AGENT_TOKEN;
var SHELL = process.env.SHELL || 'powershell.exe';
var COLS = parseInt(process.env.COLS, 10) || 200;
var ROWS = parseInt(process.env.ROWS, 10) || 50;

if (!RELAY_URL) {
  console.error('[agent] ERROR: RELAY_URL environment variable is required (e.g. wss://terminal.148.230.100.16.sslip.io)');
  process.exit(1);
}

if (!AGENT_TOKEN) {
  console.error('[agent] ERROR: AGENT_TOKEN environment variable is required');
  process.exit(1);
}

function connectAgent() {
  var ws = new WebSocket(RELAY_URL + '/ws/agent?token=' + AGENT_TOKEN);
  var ptyProcess = null;

  ws.on('open', function () {
    console.log('[agent] Connected to relay');

    try {
      ptyProcess = pty.spawn(SHELL, [], {
        name: 'xterm-color',
        cols: COLS,
        rows: ROWS,
        cwd: process.env.HOME || process.env.USERPROFILE,
        env: process.env
      });
    } catch (err) {
      console.error('[agent] Failed to spawn shell "' + SHELL + '": ' + err.message);
      ws.close();
      return;
    }

    ptyProcess.onData(function (data) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    ptyProcess.onExit(function (e) {
      console.log('[agent] PTY exited with code ' + e.exitCode + ', reconnecting...');
      ptyProcess = null;
      ws.close();
    });

    ws.on('message', function (data) {
      try {
        var msg = JSON.parse(data.toString());
        if (msg.type === 'resize') {
          try {
            ptyProcess.resize(msg.cols, msg.rows);
          } catch (err) {
            // pty may already be dead
          }
          return;
        }
      } catch (e) {
        // not JSON — treat as raw terminal input
      }

      try {
        ptyProcess.write(data.toString());
      } catch (err) {
        // pty may already be dead
      }
    });
  });

  ws.on('close', function () {
    console.log('[agent] Disconnected from relay, reconnecting in 5s...');
    if (ptyProcess) {
      try {
        ptyProcess.kill();
      } catch (err) {
        // already dead
      }
      ptyProcess = null;
    }
    setTimeout(connectAgent, 5000);
  });

  ws.on('error', function (err) {
    console.error('[agent] WebSocket error: ' + err.message);
  });
}

connectAgent();
