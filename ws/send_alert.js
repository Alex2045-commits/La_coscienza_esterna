// send_alert.js
const http = require('http');

// Prendi l'alert dal parametro della riga di comando
const alertMessage = process.argv[2] || "Default Alert Message";

// Definisci i dati da inviare
const data = JSON.stringify({ alert: alertMessage });

// Imposta le opzioni per la richiesta HTTP
const options = {
  hostname: 'localhost',
  port: 8081,
  path: '/notify',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

// Crea la richiesta HTTP
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`Server response: ${body}`);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

// Scrivi i dati nella richiesta
req.write(data);
req.end();
// Ora puoi eseguire questo script con Node.js e passare un messaggio di alert come argomento:
// node send_alert.js "Questo è un messaggio di alert!"