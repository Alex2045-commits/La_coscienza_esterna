<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/auth_middleware.php";

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: http://localhost:4000");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    // Verifica login
    $sessionUserId = (int)($_SESSION['user_id'] ?? $_SESSION['admin_id'] ?? 0);
    if ($sessionUserId <= 0) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'NOT_AUTHENTICATED']);
        exit;
    }

    $userId = $sessionUserId;

    // Aggiorna last_activity con timestamp MySQL (NOW())
    $stmt = $pdo->prepare("UPDATE users SET last_activity = NOW(), last_ip = ? WHERE id = ?");
    $stmt->execute([$_SERVER['REMOTE_ADDR'] ?? '0.0.0.0', $userId]);

    echo json_encode([
        'ok' => true,
        'message' => 'Activity updated',
        'timestamp' => date('Y-m-d H:i:s')
    ]);

} catch (Throwable $e) {
    error_log("Update Activity ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'SERVER_ERROR'
    ]);
}
