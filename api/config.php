<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

if (session_status() === PHP_SESSION_NONE) {
    session_name('la_coscienza_esterna_session');
    session_start([
        'cookie_lifetime' => 0,
        'cookie_path' => '/',
        'cookie_domain' => '',
        'cookie_secure' => false,
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax',
        'use_strict_mode' => true,
    ]);
}

// =================== ENV ===================
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if ($line === '' || str_starts_with($line, '#')) continue;
        [$k, $v] = explode('=', $line, 2);
        $_ENV[$k] = $v = trim($v, "\"'");
        putenv("$k=$v");
    }
}

define('SECURITY_SIMULATION_EVENTS', [
    'login_failed',
    'security_bruteforce',
    'sql_injection',
    'xss_attempt',
    'privilege_escalation',
    'account_takeover',
    'csrf_attempt',
    'lfi_attempt',
    'rce_attempt'
]);

function env(string $k, $default = null) {
    $v = getenv($k);
    return ($v === false || $v === '') ? $default : $v;
}

function getRawRequestBody(): string {
    $raw = (string)file_get_contents('php://input');
    if ($raw !== '') {
        return $raw;
    }
    $fallback = getenv('RAW_REQUEST_BODY');
    return $fallback === false ? '' : (string)$fallback;
}

// =================== DB ===================
try {
    $pdo = new PDO(
        "mysql:host=" . env("DB_HOST", "127.0.0.1") .
        ";dbname=" . env("DB_NAME", "utenti") .
        ";charset=utf8mb4",
        env("DB_USER", "root"),
        env("DB_PASS", ""),
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );
} catch (PDOException $e) {
    die(json_encode([
        'error' => 'DB_CONNECTION_FAILED',
        'message' => $e->getMessage()
    ]));
}

$GLOBALS['pdo'] = $pdo;
$GLOBALS['JWT_SECRET'] = env("JWT_SECRET");
$GLOBALS['JWT_TTL']    = (int)env("JWT_TTL", 900); // 900 sec = 15 min
$GLOBALS['REFRESH_TTL'] = (int)env("REFRESH_TTL", 604800); // 7 giorni
$GLOBALS["PASSWORD_PEPPER"] = env("PASSWORD_PEPPER", "");

// =================== DEV FLAGS ===================
define('DEV_AUTO_LOGIN', false); // 🔐 true SOLO se vuoi auto-login in locale

// =================== COOKIE ===================
$GLOBALS["COOKIE_SECURE"]   = secureCookie() || !isLocalhost();
$GLOBALS["COOKIE_SAMESITE"] = env("COOKIE_SAMESITE", "Lax");
$GLOBALS["COOKIE_DOMAIN"]   = env("COOKIE_DOMAIN", "localhost");

// =================== SIMULAZIONE $_SERVER PER CLI ===================
if (php_sapi_name() === 'cli') {
    $_SERVER['HTTP_HOST']   = $_SERVER['HTTP_HOST']   ?? 'localhost';
    $_SERVER['REMOTE_ADDR'] = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $_SERVER['HTTPS']       = $_SERVER['HTTPS']       ?? 'off';
}

// (opzionale) ricalcolo cookie dopo CLI
$GLOBALS["COOKIE_SECURE"]   = ($_SERVER['HTTP_HOST'] !== 'localhost');
$GLOBALS["COOKIE_SAMESITE"] = env("COOKIE_SAMESITE", "Lax");
$GLOBALS["COOKIE_DOMAIN"]   = env("COOKIE_DOMAIN", "localhost");

// =================== FUNZIONI ===================
function isLocalhost(): bool {
    $addr = $_SERVER['REMOTE_ADDR'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    return $host === 'localhost'
        || in_array($addr, ['127.0.0.1', '::1'])
        || str_starts_with($addr, '192.168.');
}

function secureCookie(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') 
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
}
// =================== FINE CONFIG =================== //
