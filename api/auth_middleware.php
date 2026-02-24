<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/startSecureAdminSession.php";
require_once __DIR__ . "/utils.php";
require_once __DIR__ . "/security_request_guard.php";
require_once __DIR__ . "/../security/security_logger.php";

/* ================= HEADERS ================= */
header('Content-Type: application/json; charset=utf-8');

/* ================= CORS ================= */
$allowedOrigin = 'http://localhost:4000';
if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] === $allowedOrigin) {
    header("Access-Control-Allow-Origin: $allowedOrigin");
}
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

security_guard_block_sqli($pdo);

/* ================= BLOCCO IP ================= */
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$check = $pdo->prepare("SELECT 1 FROM banned_ips WHERE ip = ? AND banned_until > NOW() LIMIT 1");
$check->execute([$ip]);
if ($check->fetchColumn()) {
    http_response_code(403);
    echo json_encode(['error' => 'IP_BANNED']);
    exit;
}

/* ================= ADMIN SESSION ================= */
function auth_require_admin(): array {
    // Avvia sessione admin sicura
    startSecureAdminSession();

    if (empty($_SESSION['_regenerated'])) {
        session_regenerate_id(true);
        $_SESSION['_regenerated'] = true;
    }

    if (empty($_SESSION['admin_id'])) {
        http_response_code(403);
        echo json_encode(['error' => 'ADMIN_ONLY']);
        exit;
    }

    return [
        'id' => (int)$_SESSION['admin_id'],
        'username' => $_SESSION['admin_username'] ?? 'admin',
        'role' => 'admin',
        'avatar' => $_SESSION['admin_avatar'] ?? null
    ];
}
