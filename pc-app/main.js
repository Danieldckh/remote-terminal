var path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

var electron = require('electron');
var app = electron.app;
var BrowserWindow = electron.BrowserWindow;
var Tray = electron.Tray;
var Menu = electron.Menu;
var dialog = electron.dialog;
var nativeImage = electron.nativeImage;
var childProcess = require('child_process');

var RELAY_HTTP_URL = process.env.RELAY_HTTP_URL;
var RELAY_WS_URL = process.env.RELAY_WS_URL;
var AGENT_TOKEN = process.env.AGENT_TOKEN;

var agentProcess = null;
var mainWindow = null;
var tray = null;
var isQuitting = false;

function startAgent() {
  var agentPath = path.join(__dirname, '../agent/agent.js');
  var agentEnv = Object.assign({}, process.env, {
    RELAY_URL: RELAY_WS_URL,
    AGENT_TOKEN: AGENT_TOKEN
  });

  agentProcess = childProcess.spawn('node', [agentPath], {
    env: agentEnv,
    stdio: 'pipe'
  });

  agentProcess.stdout.on('data', function(data) {
    process.stdout.write('[agent] ' + data.toString());
  });

  agentProcess.stderr.on('data', function(data) {
    process.stderr.write('[agent:err] ' + data.toString());
  });

  agentProcess.on('exit', function(code, signal) {
    console.log('[pc-app] Agent exited (code=' + code + ', signal=' + signal + '), restarting in 3s...');
    agentProcess = null;
    if (!isQuitting) {
      setTimeout(startAgent, 3000);
    }
  });

  agentProcess.on('error', function(err) {
    console.error('[pc-app] Agent spawn error:', err.message);
    agentProcess = null;
  });
}

function cleanExit() {
  isQuitting = true;
  if (agentProcess) {
    try {
      agentProcess.kill();
    } catch (e) {}
    agentProcess = null;
  }
  app.quit();
}

function createTray() {
  var icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Remote Terminal');

  var contextMenu = Menu.buildFromTemplate([
    { label: 'Remote Terminal', enabled: false },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: function() {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: function() {
        cleanExit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', function() {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(function() {
  if (!RELAY_HTTP_URL || !RELAY_WS_URL || !AGENT_TOKEN) {
    var missing = [];
    if (!RELAY_HTTP_URL) missing.push('RELAY_HTTP_URL');
    if (!RELAY_WS_URL) missing.push('RELAY_WS_URL');
    if (!AGENT_TOKEN) missing.push('AGENT_TOKEN');

    dialog.showErrorBox(
      'Configuration Missing',
      'The following required environment variables are not set:\n\n' +
      missing.join('\n') +
      '\n\nCreate a .env file in the pc-app/ directory with these variables.\n' +
      'See .env.example for reference.'
    );
    app.quit();
    return;
  }

  startAgent();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Remote Terminal',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(RELAY_HTTP_URL);

  mainWindow.webContents.on('did-fail-load', function(event, errorCode, errorDescription) {
    mainWindow.loadURL('data:text/html,' + encodeURIComponent(
      '<!DOCTYPE html>' +
      '<html><head><meta charset="utf-8">' +
      '<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;' +
      'min-height:100vh;margin:0;background:#1e1e2e;color:#cdd6f4;}' +
      '.msg{text-align:center;max-width:480px;padding:2rem;}' +
      'h1{color:#f38ba8;margin-bottom:0.5rem;}' +
      'p{line-height:1.6;color:#a6adc8;}' +
      'code{background:#313244;padding:0.2em 0.5em;border-radius:4px;font-size:0.9em;}</style>' +
      '</head><body><div class="msg">' +
      '<h1>Connection Failed</h1>' +
      '<p>Could not load the relay at:<br><code>' + RELAY_HTTP_URL + '</code></p>' +
      '<p>Error: ' + errorDescription + ' (code ' + errorCode + ')</p>' +
      '<p>Check that the relay server is running and the URL in your .env file is correct.</p>' +
      '</div></body></html>'
    ));
  });

  mainWindow.on('close', function(event) {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  createTray();
});

app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') {
    cleanExit();
  }
});

app.on('before-quit', function() {
  isQuitting = true;
  if (agentProcess) {
    try {
      agentProcess.kill();
    } catch (e) {}
  }
});

app.on('activate', function() {
  if (mainWindow) {
    mainWindow.show();
  }
});
