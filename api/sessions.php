<?php
declare(strict_types=1);

$sharedSessionPath = __DIR__ . '/../tmp/sessions';
if (!is_dir($sharedSessionPath)) mkdir($sharedSessionPath, 0777, true);

// Leggi session_id da header o POST
$sessionId = $_SERVER['HTTP_X_SESSION_ID'] ?? $_POST['session_id'] ?? null;

if (session_status() === PHP_SESSION_NONE) {
    if ($sessionId) session_id($sessionId);

    session_save_path($sharedSessionPath);
    session_start([
        'cookie_lifetime' => 0,
        'cookie_secure'   => false,   // true in HTTPS
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax',
        'use_strict_mode' => true
    ]);
}

// Assicurati CSRF token
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$GLOBALS['CURRENT_SESSION_ID'] = session_id();
$GLOBALS['CSRF_TOKEN'] = $_SESSION['csrf_token'];
