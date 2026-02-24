const WebSocket = require('ws');
const http = require('http');

// Usa la porta dal .env o fallback a 3001
const SERVER_PORT = process.env.SERVER_PORT || 3001;
const WS_URL = `ws://localhost:${SERVER_PORT}`;
const ALERT_TEST_URL = `http://localhost:${SERVER_PORT}/notify`;

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log(`Connected to server WS at ${WS_URL}`);
  
  // 🔹 NON inviare stringa semplice al WS se vuoi testare alert
  // ws.send('Hello from client!');  // <- rimuovere o commentare
  
  // Invia un alert di test al server /notify
  sendTestAlert();
});

ws.on('message', (data) => {
  console.log('Received alert:', data.toString());
});

ws.on('error', (error) => console.error('WebSocket error:', error));
ws.on('close', () => console.log('Disconnected from server WS'));

// ==========================
// Alert di test
// ==========================
function sendTestAlert() {
  const alert = {
    alert: {
      severity: 'critical',
      event: 'test_alert',
      message: 'Questo è un alert di test dal client',
      ip: '127.0.0.1',
      user_id: 999
    }
  };

  const data = JSON.stringify(alert);

  const options = {
    hostname: 'localhost',
    port: SERVER_PORT,
    path: '/notify',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const req = http.request(options, res => {
    console.log(`Alert test inviato, status: ${res.statusCode}`);
  });

  req.on('error', e => console.error(e));
  req.write(data);
  req.end();
}