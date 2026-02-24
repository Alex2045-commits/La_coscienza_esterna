<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ bootstrap locale

// 🔒 Richiama admin con verifica ruolo + 2FA
$admin = auth_require_admin();

$data = json_decode(file_get_contents("php://input"), true);

if (!is_array($data) || empty($data['ip'])) {
    http_response_code(400);
    echo json_encode(["ok"=>false, "error"=>"BAD_REQUEST"]);
    exit;
}

$ip = filter_var(trim($data['ip']), FILTER_VALIDATE_IP);
if (!$ip) {
    http_response_code(400);
    echo json_encode(["ok"=>false,"error"=>"INVALID_IP"]);
    exit;
}

// 🔒 PROTEZIONE AUTOBAN
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';

$protectedIps = [
    '127.0.0.1',
    '::1',
    $clientIp
];

if (in_array($ip, $protectedIps, true)) {
    http_response_code(403);
    echo json_encode([
        "ok" => false,
        "error" => "PROTECTED_IP"
    ]);
    exit;
}

// Elimina eventuale ban precedente
$pdo->prepare("DELETE FROM banned_ips WHERE ip = ?")->execute([$ip]);

// Calcola scadenza in base alla durata
$expires_at = null;
if ($duration === '1h') {
    $expires_at = date('Y-m-d H:i:s', time() + 3600);
} elseif ($duration === '24h') {
    $expires_at = date('Y-m-d H:i:s', time() + 86400);
} elseif ($duration === 'perma') {
    $expires_at = null; // permanente
}

// Inserisci nuovo ban
$stmt = $pdo->prepare("INSERT INTO banned_ips (ip, expires_at) VALUES (?, ?)");
$stmt->execute([$ip, $expires_at]);

echo json_encode(["ok"=>true]);
?>