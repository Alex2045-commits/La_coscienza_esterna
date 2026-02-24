<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/startSecureSession.php';

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
    echo json_encode([
        'ok' => true,
        'authenticated' => false,
        'user' => null
    ]);
    exit;
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
