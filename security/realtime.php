<?php
declare(strict_types=1);

// =========================
// SSE Realtime — La Coscienza Esterna
// =========================

// 1️⃣ Tempo illimitato & ignorare chiusura connessione
set_time_limit(0);
ignore_user_abort(true);

// 2️⃣ Config + PDO
require_once __DIR__ . '/../api/config.php';
$pdo = $GLOBALS['pdo'] ?? null; // assicurati di avere PDO pronto

// 3️⃣ Headers SSE + CORS
$isLocal = ($_SERVER['REMOTE_ADDR'] === '127.0.0.1' || $_SERVER['REMOTE_ADDR'] === '::1');
header("Content-Type: text/event-stream; charset=utf-8");
header("Cache-Control: no-cache");
header("Connection: keep-alive");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Origin: " . ($isLocal ? "http://localhost:8000" : "https://dominio.com"));
echo "retry: 5000\n\n";

// 4️⃣ Sessione
if (session_status() === PHP_SESSION_NONE) session_start();

// Dev: finto admin
if ($isLocal) {
    $_SESSION['user_id'] ??= 1;
    $_SESSION['username'] ??= 'admin';
    $_SESSION['role'] ??= 'admin';
}

// Solo admin
if (!isset($_SESSION['user_id']) || ($_SESSION['role'] ?? '') !== 'admin') {
    http_response_code(403);
    echo "event: error\ndata: " . json_encode(["message"=>"Access denied"]) . "\n\n";
    exit;
}

session_write_close();

// 5️⃣ Flush sicuro
while (ob_get_level() > 0) { @ob_end_flush(); }
ob_implicit_flush(true);

// 6️⃣ Loop SSE
$lastLogId = (int)($_GET['last_id'] ?? 0);
$lastIncidentId = (int)($_GET['last_incident_id'] ?? 0);

while (!connection_aborted()) {
    try {
        // ALERTS reali da DB
        if ($pdo) {
            // Security logs
            $stmt = $pdo->prepare("
                SELECT sl.id, sl.event, sl.severity, sl.ip, sl.user_id, u.username, sl.created_at
                FROM security_logs sl
                LEFT JOIN users u ON u.id = sl.user_id
                WHERE sl.id > ?
                ORDER BY sl.id ASC
                LIMIT 20
            ");
            $stmt->execute([$lastLogId]);
            foreach ($stmt as $a) {
                $lastLogId = (int)$a['id'];
                echo "event: alert\n";
                echo "id: {$a['id']}\n";
                echo "data: " . json_encode($a) . "\n\n";
            }

            // Security incidents
            $stmt = $pdo->prepare("SELECT * FROM security_incidents WHERE id > ? ORDER BY id ASC");
            $stmt->execute([$lastIncidentId]);
            foreach ($stmt as $i) {
                $lastIncidentId = (int)$i['id'];
                echo "event: incident\n";
                echo "id: inc-{$i['id']}\n";
                echo "data: " . json_encode(['incident' => $i]) . "\n\n";
            }
        } else {
            // Dummy alert se PDO non disponibile
            $dummyId = ++$lastLogId;
            echo "event: alert\n";
            echo "id: $dummyId\n";
            echo "data: " . json_encode([
                "id" => $dummyId,
                "event" => "Test alert $dummyId",
                "severity" => "warning",
                "ip" => "127.0.0.1",
                "user_id" => $_SESSION['user_id'] ?? 1,
                "username" => $_SESSION['username'] ?? 'admin',
                "created_at" => date('Y-m-d H:i:s')
            ]) . "\n\n";
        }

        // KEEP ALIVE ping
        echo ": ping\n\n";
        flush();
        sleep(2);

    } catch (Throwable $e) {
        error_log("SSE Error: " . $e->getMessage());
        echo ": ping\n\n";
        flush();
        sleep(2);
    }
}
