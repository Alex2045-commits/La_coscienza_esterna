<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/startSecureSession.php';
require_once __DIR__ . '/token.php';

header('Content-Type: application/json; charset=utf-8');
$allowedOrigins = ["http://localhost:4000", "http://localhost:8000"];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Vary: Origin");
}
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

startSecureSession();

$uid = (int)($_SESSION['user_id'] ?? 0);
if ($uid <= 0) {
    // Fallback Authorization header JWT
    $authHeader = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
        try {
            $payload = TokenManager::validateJwt($m[1], $pdo);
            $uid = (int)($payload['user_id'] ?? 0);
        } catch (Throwable $e) {
            $uid = 0;
        }
    }

    // Fallback cookie JWT
    if ($uid <= 0) {
        $cookieJwt = (string)($_COOKIE['access_token'] ?? '');
        if ($cookieJwt !== '') {
            try {
                $payload = TokenManager::validateJwt($cookieJwt, $pdo);
                $uid = (int)($payload['user_id'] ?? $payload['id'] ?? 0);
            } catch (Throwable $e) {
                $uid = 0;
            }
        }
    }

    if ($uid <= 0) {
        echo json_encode([
            'ok' => true,
            'authenticated' => false,
            'user' => null
        ]);
        exit;
    }
}

$stmt = $pdo->prepare("SELECT id, username, role, avatar FROM users WHERE id = ? LIMIT 1");
$stmt->execute([$uid]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    echo json_encode([
        'ok' => true,
        'authenticated' => false,
        'user' => null
    ]);
    exit;
}

// Reidrata sessione per stabilita' cross-page
$_SESSION['user_id'] = (int)$user['id'];
$_SESSION['username'] = (string)$user['username'];
$_SESSION['role'] = (string)$user['role'];
$_SESSION['avatar'] = $user['avatar'] ?? null;
if (($_SESSION['role'] ?? '') === 'admin') {
    $_SESSION['admin_id'] = (int)$user['id'];
}

echo json_encode([
    'ok' => true,
    'authenticated' => true,
    'user' => [
        'id' => (int)$user['id'],
        'username' => (string)$user['username'],
        'role' => (string)$user['role'],
        'avatar' => $user['avatar'] ?? null
    ]
]);
exit;
?>
