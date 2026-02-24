<?php
declare(strict_types=1);

function startSecureSession(): void {
    if (session_status() === PHP_SESSION_NONE) {

    // 🔑 NOME SESSIONE UNICO
    session_name('la_coscienza_esterna_session');

    session_start([
    'cookie_lifetime' => 0,
    'cookie_path' => '/',
    // Host-only cookie: evita problemi cross-port su localhost
    'cookie_domain' => '',
    'cookie_secure' => false,
    'cookie_httponly' => true,
    'cookie_samesite' => 'Lax',  // Lax per localhost HTTP
    'use_strict_mode' => true,
    ]);
    }
}
