//server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const portfinder = require('portfinder');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let PORT = parseInt(process.env.PORT, 10) || 3001;

// ==========================
// Start server con portfinder e 0.0.0.0
// ==========================
function startServer(port) {
  server.listen(port, '0.0.0.0', () => {
    console.log(`Server attivo su http://localhost:${port}`);
  });

  server.on('error', async (err) => {
    if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
      console.warn(`Porta ${port} non disponibile. Cerco una porta libera...`);

      try {
        const freePort = await portfinder.getPortPromise({ port: port + 1 });
        console.log(`Porta libera trovata: ${freePort}. Riprovo...`);
        startServer(freePort);
      } catch (e) {
        console.error('Impossibile trovare una porta libera:', e);
      }
    } else {
      console.error('Errore server:', err);
    }
  });
}

// ==========================
// CORS & JSON
// ==========================
app.use(express.json());
app.use((req, res, next) => {
  const allowedOrigins = ["http://localhost:8000", "http://localhost:3000"];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ==========================
// Helper: serve static con Range
// ==========================
function serveStaticWithRange(rootDir) {
  return (req, res, next) => {
    const filePath = path.join(rootDir, req.path);
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) return next();
      const range = req.headers.range;
      if (!range) {
        res.writeHead(200, { "Content-Length": stats.size, "Content-Type": getMimeType(filePath) });
        return fs.createReadStream(filePath).pipe(res);
      }

      const matches = /bytes=(\d*)-(\d*)/.exec(range);
      if (!matches) {
        res.writeHead(200, { "Content-Length": stats.size, "Content-Type": getMimeType(filePath) });
        return fs.createReadStream(filePath).pipe(res);
      }

      let start = parseInt(matches[1], 10);
      let end = matches[2] ? parseInt(matches[2], 10) : stats.size - 1;
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end < start || end >= stats.size) end = stats.size - 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": (end - start) + 1,
        "Content-Type": getMimeType(filePath)
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    });
  };
}

// ==========================
// Security: Block access to sensitive files
// ==========================
app.use((req, res, next) => {
  const sensitivePatterns = ['.env', '.git', '.htaccess', 'package.json', 'package-lock.json'];
  const requestedPath = req.path;
  
  if (sensitivePatterns.some(pattern => requestedPath.includes(pattern))) {
    console.log(`[SECURITY] Tentativo di accesso a file sensibile: ${requestedPath} da ${req.ip}`);
    return res.status(403).json({ error: 'Accesso negato' });
  }
  next();
});

// ==========================
// Serve static folders
// ==========================
app.use('/admin', serveStaticWithRange(path.join(__dirname, 'public', 'admin')));
app.use('/sounds', serveStaticWithRange(path.join(__dirname, 'public', 'sounds')));
app.use('/icons', serveStaticWithRange(path.join(__dirname, 'public', 'icons')));
app.use('/', serveStaticWithRange(path.join(__dirname, 'public')));

// ==========================
// Home route
// ==========================
app.get('/', (req, res) => {
  res.redirect(302, '/index/index.html');
});

// ==========================
// PHP bridge
// ==========================
function handlePhpBridge(req, res) {
  let { filename } = req.params;
  if (filename.endsWith('.php')) filename = filename.slice(0, -4);
  const filePath = path.join(__dirname, 'api', filename + '.php');
  const payload = JSON.stringify(req.method === 'GET' ? req.query : req.body);

  const php = spawn(
    "C:\\Program Files (x86)\\php-8.2.29-Win32-vs16-x64\\php.exe",
    [filePath],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HTTP_COOKIE: req.headers.cookie || '',
        HTTP_X_SESSION_ID: req.headers['x-session-id'] || '',
        RAW_REQUEST_BODY: payload,
        REQUEST_METHOD: req.method,
        CONTENT_TYPE: req.headers['content-type'] || 'application/json'
      }
    }
  );

  // Write payload to stdin
  php.stdin.write(payload);
  php.stdin.end();

  let output = '', errorOutput = '';
  php.stdout.on('data', d => output += d.toString());
  php.stderr.on('data', d => errorOutput += d.toString());

  php.on('close', () => {
    try {
      const lines = output.trim().split("\n");
      const lastLine = lines[lines.length - 1];
      const json = JSON.parse(lastLine);
      res.json(json);
    } catch (e) {
      console.error("Errore PHP:", e, errorOutput);
      res.status(500).json({ ok: false, error: "PHP non ha restituito JSON valido" });
    }
  });
}

app.get('/api/:filename', handlePhpBridge);
app.post('/api/:filename', handlePhpBridge);

// ==========================
// Anti-spam alerts in RAM
// ==========================
const sentAlerts = new Map();
const ALERT_TTL = 60 * 1000;

app.post('/notify', (req, res) => {
  const alert = req.body;

  if (!alert.alert?.created_at) {
    alert.alert = {
      ...alert.alert,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
  }

  const key = `${alert?.alert?.event}|${alert?.alert?.ip}|${alert?.alert?.user_id ?? 'null'}`;
  const now = Date.now();

  if (sentAlerts.has(key) && now - sentAlerts.get(key) < ALERT_TTL) {
    return res.send("skipped");
  }

  sentAlerts.set(key, now);
  for (const [k, t] of sentAlerts.entries()) {
    if (now - t > ALERT_TTL) sentAlerts.delete(k);
  }

  const msg = JSON.stringify({ type: "alert", alert });

  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });

  res.send("ok");
});

// ==========================
// WebSocket
// ==========================
wss.on('connection', ws => {
  console.log('Client WS connesso');
  ws.on('message', msg => console.log('Messaggio da client:', msg.toString()));
  ws.on('close', () => console.log('Client WS disconnesso'));
});

// ==========================
// Helper MIME types
// ==========================
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch(ext) {
    case ".js": return "application/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".html": return "text/html; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".mp3": return "audio/mpeg";
    case ".ico": return "image/x-icon";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    default: return "application/octet-stream";
  }
}

// ==========================
// Avvio server con gestione porta
// ==========================
startServer(PORT);
const clientConfigPath = path.join(__dirname, 'public', 'client_config.js');

fs.writeFileSync(clientConfigPath, `window.SERVER_PORT = ${PORT};\n`, 'utf-8');
console.log(`client_config.js aggiornato con porta ${PORT}`);
