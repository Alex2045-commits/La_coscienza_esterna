<?php
declare(strict_types=1);

require_once __DIR__ . "/../../api/config.php";
require_once __DIR__ . "/../../api/startSecureAdminSession.php";
require_once __DIR__ . '/../../security/security_logger.php';
require_once __DIR__ . "/../../api/utils.php";

// Avvia sessione sicura admin
startSecureAdminSession();

// Fallback SOLO su localhost
if (isLocalhost()) {
    $_SESSION['user_id']  ??= 1;
    $_SESSION['username'] ??= 'admin';
    $_SESSION['role']     ??= 'admin';
    $_SESSION['admin_2fa_verified'] = true;
}
?>