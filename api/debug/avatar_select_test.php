<?php
declare(strict_types=1);
// Debug script: simulate internal avatar selection for user id=1
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../startSecureSession.php';
require_once __DIR__ . '/../user/auth_middleware.php';
require_once __DIR__ . '/../csrf.php';
require_once __DIR__ . '/../utils.php';
// ensure minimal SERVER globals for middleware
$_SERVER['REQUEST_METHOD'] = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$_SERVER['HTTP_ORIGIN'] = $_SERVER['HTTP_ORIGIN'] ?? 'http://localhost:4000';

require_once __DIR__ . '/../../security/security_logger.php';

header('Content-Type: application/json; charset=utf-8');

// start session and auto-set user for debug
startSecureSession();
$_SESSION['user_id'] = 1; // debug user

$user = auth_user();
if (!$user) {
    echo json_encode(['error'=>'AUTH_FAILED']);
    exit;
}
$uid = (int)$user['id'];

$avatar = 'avatar1.png';

$avatarsDir = dirname(__DIR__, 2) . '/avatars/';
if (!is_dir($avatarsDir)) {
    @mkdir($avatarsDir, 0755, true);
}
$path = $avatarsDir . $avatar;
if (!file_exists($path)) {
    echo json_encode(['error' => 'AVATAR_NOT_FOUND', 'path' => $path]);
    exit;
}

// update DB
$st = $pdo->prepare("UPDATE users SET avatar = :a WHERE id = :id");
$ok = $st->execute([':a' => $avatar, ':id' => $uid]);
if (!$ok) {
    echo json_encode(['error' => 'DB_UPDATE_FAILED']);
    exit;
}
log_event($uid, 'avatar_set_debug', $avatar);

echo json_encode(['ok' => true, 'avatar' => $avatar, 'user_id' => $uid, 'path' => $path]);
