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
const PHP_EXECUTABLE = process.env.PHP_BIN || "C:\\Program Files (x86)\\php-8.2.29-Win32-vs16-x64\\php.exe";

let PORT = parseInt(process.env.PORT, 10) || 3001;

// ==========================
// Server startup with portfinder and 0.0.0.0 binding
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
function spawnPhpProcess(filePath, req, payload) {
  const safePayload = typeof payload === 'string' ? payload : '{}';
  const php = spawn(
    PHP_EXECUTABLE,
    [filePath],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HTTP_COOKIE: req.headers.cookie || '',
        HTTP_AUTHORIZATION: req.headers.authorization || '',
        HTTP_X_SESSION_ID: req.headers['x-session-id'] || '',
        RAW_REQUEST_BODY: safePayload,
        REQUEST_METHOD: req.method,
        REQUEST_URI: req.originalUrl || req.url || '',
        CONTENT_TYPE: req.headers['content-type'] || 'application/json'
      }
    }
  );
  php.stdin.write(safePayload);
  php.stdin.end();
  return php;
}

function resolvePhpPath(rootDir, rawTarget) {
  if (!rawTarget || typeof rawTarget !== 'string') return null;
  const clean = rawTarget.replace(/^\/+/, '').replace(/\\/g, '/');
  if (clean.includes('..')) return null;
  const normalized = clean.endsWith('.php') ? clean : `${clean}.php`;
  const rootPath = path.resolve(__dirname, rootDir);
  const fullPath = path.resolve(rootPath, normalized);
  if (!fullPath.startsWith(rootPath)) return null;
  return fullPath;
}

function parseJsonLastLine(output) {
  const trimmed = (output || '').trim();
  if (!trimmed) throw new Error('PHP output empty');
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // Extract a valid JSON block from mixed output (warnings + JSON)
    const firstObj = trimmed.indexOf('{');
    const lastObj = trimmed.lastIndexOf('}');
    if (firstObj !== -1 && lastObj > firstObj) {
      const candidate = trimmed.slice(firstObj, lastObj + 1);
      return JSON.parse(candidate);
    }

    const firstArr = trimmed.indexOf('[');
    const lastArr = trimmed.lastIndexOf(']');
    if (firstArr !== -1 && lastArr > firstArr) {
      const candidate = trimmed.slice(firstArr, lastArr + 1);
      return JSON.parse(candidate);
    }

    throw new Error('No valid JSON block in PHP output');
  }
}

function getPayload(req) {
  if (req.method === 'GET') return JSON.stringify(req.query || {});
  return JSON.stringify(req.body || {});
}

function runPhpJson(filePath, req, res) {
  const payload = getPayload(req);
  const php = spawnPhpProcess(filePath, req, payload);

  let output = '';
  let errorOutput = '';
  php.stdout.on('data', d => output += d.toString());
  php.stderr.on('data', d => errorOutput += d.toString());

  php.on('close', () => {
    try {
      const json = parseJsonLastLine(output);
      res.json(json);
    } catch (e) {
      console.error("Errore PHP:", e, errorOutput);
      res.status(500).json({ ok: false, error: "PHP non ha restituito JSON valido" });
    }
  });
}

function handlePhpJsonBridge(rootDir) {
  return (req, res) => {
    const rawTarget = req.params.filename || req.params[0];
    const filePath = resolvePhpPath(rootDir, rawTarget);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'PHP_ENDPOINT_NOT_FOUND' });
    }
    runPhpJson(filePath, req, res);
  };
}

function handlePhpPageBridge(rootDir) {
  return (req, res, next) => {
    const rawTarget = req.params.filename || req.params[0];
    if (!rawTarget || !String(rawTarget).endsWith('.php')) return next();
    const filePath = resolvePhpPath(rootDir, rawTarget);
    if (!fs.existsSync(filePath)) return next();

    const payload = JSON.stringify(req.query || {});
    const php = spawnPhpProcess(filePath, req, payload);

    let output = '', errorOutput = '';
    php.stdout.on('data', d => output += d.toString());
    php.stderr.on('data', d => errorOutput += d.toString());

    php.on('close', (code) => {
      if (code !== 0 && !output.trim()) {
        console.error(`Errore PHP page bridge (${rootDir}/${rawTarget}):`, errorOutput);
        return res.status(500).send('Errore rendering pagina PHP');
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(output);
    });
  };
}

app.get('/api/:filename', handlePhpJsonBridge('api'));
app.post('/api/:filename', handlePhpJsonBridge('api'));
app.get(/^\/api\/(.+)$/, handlePhpJsonBridge('api'));
app.post(/^\/api\/(.+)$/, handlePhpJsonBridge('api'));
app.get('/admin/api/:filename', handlePhpJsonBridge(path.join('admin', 'api')));
app.post('/admin/api/:filename', handlePhpJsonBridge(path.join('admin', 'api')));
app.get(/^\/admin\/api\/(.+)$/, handlePhpJsonBridge(path.join('admin', 'api')));
app.post(/^\/admin\/api\/(.+)$/, handlePhpJsonBridge(path.join('admin', 'api')));
app.get('/user/api/:filename', handlePhpJsonBridge(path.join('user', 'api')));
app.post('/user/api/:filename', handlePhpJsonBridge(path.join('user', 'api')));
app.get(/^\/user\/api\/(.+)$/, handlePhpJsonBridge(path.join('user', 'api')));
app.post(/^\/user\/api\/(.+)$/, handlePhpJsonBridge(path.join('user', 'api')));
app.get('/admin/:filename', handlePhpPageBridge('admin'));
app.get('/user/:filename', handlePhpPageBridge('user'));
app.get(/^\/admin\/(.+\.php)$/, handlePhpPageBridge('admin'));
app.get(/^\/user\/(.+\.php)$/, handlePhpPageBridge('user'));


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
// Start server with dynamic port handling
// ==========================
startServer(PORT);
const clientConfigPath = path.join(__dirname, 'public', 'client_config.js');

fs.writeFileSync(clientConfigPath, `window.SERVER_PORT = ${PORT};\n`, 'utf-8');
console.log(`client_config.js aggiornato con porta ${PORT}`);

