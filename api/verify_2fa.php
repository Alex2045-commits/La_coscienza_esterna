<?php
declare(strict_types=1);

use OTPHP\TOTP;

require_once __DIR__ . "/token.php";
require_once __DIR__ . "/config.php";
require_once __DIR__ . "/../vendor/autoload.php";
require_once __DIR__ . "/sessions.php";
require_once __DIR__ . "/startSecureSession.php";
require_once __DIR__ . "/utils.php";
require_once __DIR__ . "/../security/security_logger.php";

/* ================= CORS ================= */
header("Access-Control-Allow-Origin: http://localhost:4000");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

startSecureSession();

/* ================= CHECK SESSION 2FA ================= */
if (!isset($_SESSION['2fa_user_id'], $_SESSION['2fa_started_at'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => '2FA_SESSION_MISSING']);
    exit;
}

/* ================= TIMEOUT 2FA ================= */
if (time() - $_SESSION['2fa_started_at'] > 300) {
    session_destroy();
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => '2FA_EXPIRED']);
    exit;
}

/* ================= READ JSON ================= */
$raw = getRawRequestBody();
$data = json_decode($raw, true);
$code = trim($data['code'] ?? '');
if ($code === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'CODE_REQUIRED']);
    exit;
}

/* ================= FETCH USER ================= */
$stmt = $pdo->prepare("SELECT id, username, role, avatar, twofa_secret FROM users WHERE id=?");
$stmt->execute([$_SESSION['2fa_user_id']]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'INVALID_2FA_USER']);
    exit;
}

/* ================= VERIFY TOTP ================= */
$totp = TOTP::create($user['twofa_secret']);
if (!$totp->verify($code)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'INVALID_2FA_CODE']);
    exit;
}

$newPayload = [
    "id" => $user["id"],
    "role" => $user["role"],
    "twofa" => true,
    "exp" => time() + $GLOBALS['JWT_TTL']
];

$jwt = TokenManager::generateJwt($newPayload);

// pulizia sessione temporanea 2FA
unset($_SESSION['2fa_user_id'], $_SESSION['2fa_started_at']);


$_SESSION['user_id'] = $user['id'];
$_SESSION['admin_id'] = $user['id']; // ✅ QUESTA È LA CHIAVE
$_SESSION['username'] = $user['username'];
$_SESSION['role'] = $user['role']; // deve essere 'admin'
$_SESSION['avatar'] = $user['avatar'] ?? null;
$_SESSION['twofa_verified'] = true;

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
try {
    $upd = $pdo->prepare("UPDATE users SET last_activity = NOW(), last_ip = ? WHERE id = ?");
    $upd->execute([$ip, (int)$user['id']]);
} catch (Throwable $e) {
    error_log('verify_2fa last_activity update failed: ' . $e->getMessage());
}

security_log($pdo, (int)$user['id'], 'user_login', [
    'method' => 'totp',
    'ip' => $ip,
    'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown'
]);
add_notification((int)$user['id'], "Sicurezza: accesso completato con codice 2FA.");

setcookie("access_token", $jwt, [
    'expires' => time() + $GLOBALS['JWT_TTL'],
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);

echo json_encode([
    'ok' => true,
    'twofa_required' => false,
    'role' => $user['role'],
    'jwt' => $jwt
]);
exit;
