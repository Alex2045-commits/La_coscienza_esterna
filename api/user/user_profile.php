<?php
declare(strict_types=1);
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/../../security/security_logger.php';

ini_set('display_errors', '0');
error_reporting(E_ALL);

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

// Get user from middleware
$user = auth_require_user();
$uid = (int)$user['id'];

$stmt = $pdo->prepare("SELECT id, username, email, role, created_at, avatar, last_activity FROM users WHERE id = :id LIMIT 1");
$stmt->execute([':id' => $uid]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    http_response_code(404);
    echo json_encode(['error' => 'User not found']);
    exit;
}

// Log access
security_log($pdo, $uid, 'user_profile_access', [
    'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
]);

echo json_encode([
    'ok' => true,
    'user' => $row
]);
exit;