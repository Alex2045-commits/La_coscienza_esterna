<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/token.php";
require_once __DIR__ . "/startSecureSession.php";
require_once __DIR__ . "/utils.php";
require_once __DIR__ . "/mail.php";
require_once __DIR__ . "/email_verification_lib.php";
require_once __DIR__ . "/security_request_guard.php";
require_once __DIR__ . "/../security/security_logger.php";

/* =================== CORS =================== */
header("Access-Control-Allow-Origin: http://localhost:4000");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token");
header("Content-Type: application/json");
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

/* =================== SESSIONE & INFO =================== */
startSecureSession();
security_guard_block_payload_attacks($pdo);

$ip        = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';

define('BF_LIMIT', 5);
define('EMAIL_OTP_TTL', 300);

// Rate limit globale login per sessione/IP (finestra breve)
$nowTs = time();
$attemptWindow = $_SESSION['login_attempts_window'] ?? [];
if (!is_array($attemptWindow)) $attemptWindow = [];
$attemptWindow = array_values(array_filter($attemptWindow, static fn($ts) => ((int)$ts > ($nowTs - 60))));
if (count($attemptWindow) >= 20) {
    security_log($pdo, null, 'login_rate_limited', ['ip' => $ip, 'ua' => $userAgent]);
    http_response_code(429);
    echo json_encode(['ok' => false, 'error' => 'TOO_MANY_REQUESTS']);
    exit;
}
$attemptWindow[] = $nowTs;
$_SESSION['login_attempts_window'] = $attemptWindow;

/* =================== BLOCCO IP =================== */
if (isIpBanned($ip)) {
    security_log($pdo, null, 'blocked_request', [
        'ip' => $ip,
        'ua' => $userAgent,
        'reason' => 'ip_banned_login_attempt'
    ]);
    http_response_code(403);
    echo json_encode(['ok'=>false,'error'=>'IP_BANNED']);
    exit;
}

/* =================== INPUT =================== */
$data = json_decode(getRawRequestBody(), true);
if (!is_array($data)) {
    echo json_encode(['ok'=>false,'error'=>'INVALID_JSON']);
    exit;
}

$identifier = trim($data['identifier'] ?? '');
$password   = trim($data['password'] ?? '');

if ($identifier === '' || $password === '') {
    echo json_encode(['ok'=>false,'error'=>'MISSING_FIELDS']);
    exit;
}

/* =================== BRUTE FORCE =================== */
$bfKey = 'bf_' . sha1($ip . '|' . strtolower($identifier));
$attempts  = $_SESSION[$bfKey] ?? 0;

/* =================== SQL INJECTION =================== */
$sqlScore = detectSqlInjection($identifier) + detectSqlInjection($password, true);
if ($sqlScore >= 30) {
    handleSecurityScore($ip, 20, 'sql injection detected');
    security_log($pdo, null, 'sql_injection', [
        'ip'=>$ip,
        'score'=>$sqlScore,
        'hash'=>hash('sha256', $identifier),
        'ua'=>$userAgent
    ]);
    http_response_code(403);
    echo json_encode(['ok'=>false,'error'=>'INVALID_LOGIN']);
    exit;
}

/* =================== CERCA UTENTE =================== */
$stmt = $pdo->prepare("
    SELECT id, username, email, password_hash, role, avatar, banned_until, twofa_secret, last_ip
    FROM users
    WHERE username = ? OR email = ?
    LIMIT 1
");
$stmt->execute([$identifier, $identifier]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

/* =================== UTENTE NON TROVATO =================== */
if (!$user) {
    $attempts++;
    $_SESSION[$bfKey] = $attempts;

    handleSecurityScore($ip, 2, 'login failed, user not found');

    security_log($pdo, null, 'login_failed', [
        'ip'=>$ip,
        'identifier_hash'=>hash('sha256', strtolower($identifier)),
        'user_agent'=>$userAgent
    ]);

    publicLoginError();
}

/* =================== PASSWORD ERRATA =================== */
$pepper = $GLOBALS['PASSWORD_PEPPER'] ?? '';
$passwordOk = password_verify($password.$pepper, $user['password_hash']);
$usedLegacyHash = false;

// Compatibilita account legacy creati senza pepper
if (!$passwordOk) {
    $passwordOk = password_verify($password, $user['password_hash']);
    $usedLegacyHash = $passwordOk;
}

if (!$passwordOk) {
    $attempts++;
    $_SESSION[$bfKey] = $attempts;

    handleSecurityScore($ip, 5, 'login failed, wrong password');

    security_log($pdo, (int)$user['id'], 'login_failed', [
        'ip'=>$ip,
        'user_agent'=>$userAgent
    ]);

    if ($attempts === 3) {
        add_notification((int)$user['id'], "Sicurezza: rilevati 3 tentativi di accesso falliti sul tuo account.");
    }

    publicLoginError();
}

// Se login legacy riuscito, migra hash al formato con pepper
if ($usedLegacyHash && $pepper !== '') {
    try {
        $newHash = password_hash($password . $pepper, PASSWORD_ARGON2ID);
        $upd = $pdo->prepare("UPDATE users SET password_hash = :hash WHERE id = :id");
        $upd->execute([
            ':hash' => $newHash,
            ':id' => (int)$user['id']
        ]);
    } catch (Throwable $e) {
        error_log('login legacy hash migration failed: ' . $e->getMessage());
    }
}

/* =================== BF → EMAIL OTP =================== */
if ($attempts >= BF_LIMIT) {
    if (!empty($_SESSION['otp_sent_at']) && time() - $_SESSION['otp_sent_at'] < 60) {
        echo json_encode(['ok'=>false,'error'=>'OTP_COOLDOWN']);
        exit;
    }

    $_SESSION['otp_sent_at'] = time();
    require_once __DIR__.'/mail.php';
    $otp = random_int(100000,999999);

    $_SESSION['email_otp'] = [
        'user_id' => $user['id'],
        'code'    => password_hash((string)$otp, PASSWORD_DEFAULT),
        'expires' => time() + EMAIL_OTP_TTL
    ];

    sendEmail($user['email'], 'Codice di sicurezza', "Ciao {$user['username']},\n\nCodice OTP: {$otp}\nScade tra 5 minuti.");
    add_notification((int)$user['id'], "Sicurezza: troppi tentativi falliti. Ti abbiamo richiesto una verifica OTP.");

    security_log($pdo, (int)$user['id'], 'email_otp_sent', ['ip'=>$ip]);

    echo json_encode([
        'ok'=>true,
        'email_verification_required'=>true,
        'user_id'=>$user['id']
    ]);
    exit;
}

/* =================== 2FA =================== */
ensureEmailVerificationTable($pdo);
if (($user['role'] ?? 'user') === 'user' && !isEmailVerified($pdo, (int)$user['id'])) {
    $mustResend = canResendEmailVerification($pdo, (int)$user['id'], 60);
    if ($mustResend) {
        $code = issueEmailVerificationCode($pdo, (int)$user['id'], (string)$user['email'], 600);
        $safeUsername = htmlspecialchars((string)$user['username'], ENT_QUOTES, 'UTF-8');
        $mailBody = "
            <h2>Verifica il tuo account La Coscienza Esterna</h2>
            <p>Ciao <strong>{$safeUsername}</strong>,</p>
            <p>il tuo codice di verifica e:</p>
            <p style=\"font-size:24px;font-weight:700;letter-spacing:2px;\">{$code}</p>
            <p>Scade in 10 minuti.</p>
        ";
        try {
            sendEmail((string)$user['email'], 'Verifica email - La Coscienza Esterna', $mailBody);
            security_log($pdo, (int)$user['id'], 'email_verification_sent', ['ip' => $ip]);
        } catch (Throwable $e) {
            error_log('login email verification send failed: ' . $e->getMessage());
        }
    }

    security_log($pdo, (int)$user['id'], 'login_blocked_email_unverified', ['ip' => $ip]);
    http_response_code(403);
    echo json_encode([
        'ok' => false,
        'error' => 'EMAIL_NOT_VERIFIED',
        'user_id' => (int)$user['id']
    ]);
    exit;
}

$skip2faInDev = in_array(
    strtolower((string)env('SKIP_2FA_IN_DEV', '0')),
    ['1', 'true', 'yes', 'on'],
    true
);
$isDevLocal = ((string)env('APP_ENV', 'prod') === 'dev') && isLocalhost();
$mustRequire2fa = ($user['role'] === 'admin' || !empty($user['twofa_secret'])) && !($isDevLocal && $skip2faInDev);

if ($mustRequire2fa) {
    session_regenerate_id(true);
    $_SESSION['2fa_user_id'] = $user['id'];
    $_SESSION['2fa_started_at'] = time();

    $tempToken = TokenManager::generateJwt([
        'user_id'=>$user['id'],
        'twofa'=>true,
        'exp'=>time()+300
    ]);

    echo json_encode([
        'ok'=>true,
        'twofa_required'=>true,
        'role' => $user['role'],
        'temp_token'=>$tempToken
    ]);
    exit;
}

/* =================== LOGIN OK =================== */
unset($_SESSION[$bfKey]);
session_regenerate_id(true);

// Imposta sessione utente
$_SESSION['user_id'] = $user['id'];
$_SESSION['username'] = $user['username'];
$_SESSION['role'] = $user['role'];
$_SESSION['avatar'] = $user['avatar'] ?? null;
if (($user['role'] ?? '') === 'admin') {
    $_SESSION['admin_id'] = (int)$user['id'];
}

// Aggiorna ultimo accesso in last_activity
try {
    $stmt = $pdo->prepare("UPDATE users SET last_activity = NOW(), last_ip = :ip WHERE id = :id");
    $stmt->execute([':ip' => $ip, ':id' => $user['id']]);
} catch (Throwable $e) {
    // Logga l'errore ma non bloccare il login
    security_log($pdo, (int)$user['id'], 'error_update_last_activity', [
        'ip' => $ip,
        'error' => $e->getMessage()
    ]);
}

// CSRF token
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Genera JWT token per cross-port usage
$authToken = TokenManager::generateJwt([
    'user_id' => $user['id'],
    'username' => $user['username'],
    'role' => $user['role'],
    'exp' => time() + (7 * 24 * 60 * 60) // 7 giorni
]);

// Persisti anche il JWT in cookie HttpOnly per fallback lato server
setcookie("access_token", $authToken, [
    'expires' => time() + (7 * 24 * 60 * 60),
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);

// Reset IP score positivo per login corretto
if (function_exists('resetSecurityScore')) {
    resetSecurityScore($ip);
}

// Log di login riuscito
security_log($pdo, (int)$user['id'], 'user_login', [
    'ip' => $ip,
    'user_agent' => $userAgent
]);

$previousIp = (string)($user['last_ip'] ?? '');
if ($previousIp !== '' && $previousIp !== $ip) {
    add_notification((int)$user['id'], "Sicurezza: nuovo accesso da IP {$ip}. Se non sei stato tu, cambia password.");
}

echo json_encode([
    'ok' => true,
    'twofa_required' => false,
    'role' => $user['role'],
    'csrf_token' => $_SESSION['csrf_token'],
    'auth_token' => $authToken,
    'auth_token_jwt' => $authToken,
    'security_score' => getIpScore($ip)
]);
exit;
