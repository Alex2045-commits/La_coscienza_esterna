<?php
declare(strict_types=1);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/token.php";
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . "/utils.php";
require_once __DIR__ . "/../security/security_logger.php";
require_once __DIR__ . "/startSecureAdminSession.php";

header("Access-Control-Allow-Origin: http://localhost:4000");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=utf-8");

startSecureAdminSession();

// Risposta per preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$data = json_decode(getRawRequestBody(), true);
$code = trim($data["code"] ?? "");
$userId = (int)($data["user_id"] ?? 0);

if (!$code || !$userId) {
    http_response_code(400);
    exit(json_encode(["error" => "BAD_REQUEST"]));
}

// recupera admin
$stmt = $pdo->prepare("
    SELECT id, username, role, avatar, twofa_secret
    FROM users
    WHERE id = ?
");
$stmt->execute([$userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    http_response_code(401);
    exit(json_encode(["error" => "INVALID_USER"]));
}

// verifica codice 2FA (email / TOTP)
if (
    empty($_SESSION['email_otp']) ||
    $_SESSION['email_otp']['user_id'] !== $userId ||
    $_SESSION['email_otp']['expires'] < time() ||
    !password_verify($code, $_SESSION['email_otp']['code'])
) {
    http_response_code(401);
    exit(json_encode(["error" => "INVALID_2FA"]));
}

// OTP valido
unset($_SESSION['email_otp']);

$_SESSION['user_id'] = (int)$user['id'];
$_SESSION['username'] = (string)$user['username'];
$_SESSION['role'] = (string)$user['role'];
$_SESSION['avatar'] = $user['avatar'] ?? null;
$_SESSION['email_otp_verified'] = (int)$user['id'];
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
if ($user['role'] === 'admin') $_SESSION['admin_id'] = (int)$user['id'];

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
try {
    $upd = $pdo->prepare("UPDATE users SET last_activity = NOW(), last_ip = ? WHERE id = ?");
    $upd->execute([$ip, (int)$user['id']]);
} catch (Throwable $e) {
    error_log('confirm_2fa last_activity update failed: ' . $e->getMessage());
}

// Se ha TOTP configurato, passa alla verifica 2FA classica
if (!empty($user['twofa_secret'])) {
    $_SESSION['2fa_user_id'] = (int)$user['id'];
    $_SESSION['2fa_started_at'] = time();

    echo json_encode([
        "ok" => true,
        "twofa_required" => true,
        "role" => $user['role']
    ]);
    exit;
}

// LOG ACCESSO RIUSCITO
security_log($pdo, (int)$user['id'], 'user_login', [
    'method' => 'email_otp',
    'ip' => $ip,
    'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown'
]);
add_notification((int)$user['id'], "Sicurezza: accesso effettuato tramite verifica email OTP.");

// JWT
$jwt = TokenManager::generateJwt([
    'id'       => $user['id'],
    'username' => $user['username'],
    'role'     => $user['role'],
    'avatar'   => $user['avatar']
]);

setcookie("access_token", $jwt, [
    "expires"  => time() + 3600,
    "path"     => "/",
    "httponly" => true,
    "samesite" => "Lax"
]);

echo json_encode([
    "ok" => true,
    "twofa_required" => false,
    "role" => $user['role'],
    "csrf_token" => $_SESSION['csrf_token']
]);
?>
