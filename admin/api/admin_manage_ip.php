<?php
declare(strict_types=1);
ini_set('display_errors', '1');
error_reporting(E_ALL);

require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ bootstrap locale

// 🔒 Richiama admin con verifica ruolo + 2FA
$admin = auth_require_admin();

// Assicurati che $pdo esista
$pdo = $GLOBALS['pdo'] ?? null;
if (!$pdo) {
    try {
        $pdo = new PDO(
            "mysql:host=" . getenv("DB_HOST") . ";dbname=" . getenv("DB_NAME") . ";charset=utf8mb4",
            getenv("DB_USER"),
            getenv("DB_PASS"),
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]
        );
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["ok"=>false,"error"=>"DB_CONNECTION_FAILED","msg"=>$e->getMessage()]);
        exit;
    }
}

// Controlla se la tabella banned_ips esiste, altrimenti la crea
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS banned_ips (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ip VARCHAR(45) NOT NULL UNIQUE,
            expires_at DATETIME DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    ");
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["ok"=>false,"error"=>"TABLE_CREATION_FAILED","msg"=>$e->getMessage()]);
    exit;
}

// Leggi input JSON
$data = json_decode(file_get_contents("php://input"), true);

if (!is_array($data) || empty($data['ip']) || empty($data['action'])) {
    http_response_code(400);
    echo json_encode(["ok"=>false,"error"=>"BAD_REQUEST"]);
    exit;
}

$ip = filter_var(trim($data['ip']), FILTER_VALIDATE_IP);
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';

if (in_array($ip, ['127.0.0.1', '::1', $clientIp], true)) {
    http_response_code(403);
    exit(json_encode([
        "ok" => false,
        "error" => "PROTECTED_IP"
    ]));
}

// Non permettere ban IP admin
$stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE last_ip = ? AND role = 'admin'");
$stmt->execute([$ip]);

if ($stmt->fetchColumn() > 0) {
    http_response_code(403);
    exit(json_encode([
        "ok" => false,
        "error" => "ADMIN_IP_PROTECTED"
    ]));
}

$action = trim($data['action']);
$duration = $data['duration'] ?? null;

if (!$ip) {
    http_response_code(400);
    echo json_encode(["ok"=>false,"error"=>"INVALID_IP"]);
    exit;
}

try {
    if ($action === "unban") {
        $stmt = $pdo->prepare("DELETE FROM banned_ips WHERE ip = ?");
        $stmt->execute([$ip]);
        echo json_encode(["ok"=>true, "message"=>"IP sbloccato"]);
        exit;
    }

    if ($action === "ban") {
        if (!$duration || !in_array($duration, ['1h','24h','perma'])) {
            http_response_code(400);
            echo json_encode(["ok"=>false,"error"=>"BAD_DURATION"]);
            exit;
        }

        // Rimuove eventuale ban precedente
        $pdo->prepare("DELETE FROM banned_ips WHERE ip = ?")->execute([$ip]);

        // Calcola scadenza
        $expires_at = null;
        if ($duration === '1h') $expires_at = date('Y-m-d H:i:s', time() + 3600);
        elseif ($duration === '24h') $expires_at = date('Y-m-d H:i:s', time() + 86400);

        $stmt = $pdo->prepare("INSERT INTO banned_ips (ip, expires_at) VALUES (?, ?)");
        $stmt->execute([$ip, $expires_at]);

        echo json_encode(["ok"=>true, "message"=>"IP bannato", "expires_at"=>$expires_at]);
        exit;
    }

    http_response_code(400);
    echo json_encode(["ok"=>false,"error"=>"UNKNOWN_ACTION"]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["ok"=>false,"error"=>"PDO_ERROR","msg"=>$e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["ok"=>false,"error"=>"SERVER_ERROR","msg"=>$e->getMessage()]);
}
?>