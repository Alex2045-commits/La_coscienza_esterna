<?php
declare(strict_types=1);
require_once __DIR__ . "/startSecureSession.php";

function startSecureAdminSession(): void {
    $isLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1','::1'])
        || ($_SERVER['HTTP_HOST'] ?? '') === 'localhost'
        || strpos($_SERVER['HTTP_HOST'] ?? '', 'localhost:') === 0;

    if (session_status() === PHP_SESSION_NONE) {
        // 🔑 Nome sessione unico
        session_name('la_coscienza_esterna_session');

        session_start([
            'cookie_lifetime' => 0,
            'cookie_path' => '/',
            // Host-only cookie: evita problemi cross-port su localhost
            'cookie_domain' => '',
            'cookie_secure' => false,
            'cookie_httponly' => true,
            'cookie_samesite' => 'Lax',  // Lax funziona su localhost HTTP
            'use_strict_mode' => true,
        ]);
    }

    // Genera CSRF token se non esiste
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
}
