<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../../../api/config.php';              // $pdo
require_once __DIR__ . '/../../../api/auth_middleware.php';     // auth_require_admin
require_once __DIR__ . '/../../../api/csrf.php';                // auth_require_csrf
require_once __DIR__ . '/../../../api/mail.php';                // sendEmail()
require_once __DIR__ . '/../../../api/startSecureAdminSession.php';     // startSecureAdminSession()

startSecureAdminSession();
$admin = auth_require_admin();    // controlla admin + sessione 2FA

auth_require_csrf();              // CSRF

header('Content-Type: application/json; charset=utf-8');

// Genera codice 2FA temporaneo
$twofa_code = random_int(100000, 999999); // 6 cifre

// Salva in sessione con scadenza 5 min
$_SESSION['clear_2fa'] = password_hash((string)$twofa_code, PASSWORD_DEFAULT);
$_SESSION['clear_2fa_expires'] = time() + 300; // 5 minuti

// Invia email
if (!empty($admin['email'])) {
    $subject = "🔐 Codice 2FA per eliminazione log";
    $body = "Ciao {$admin['username']},\n\n"
          . "Il tuo codice 2FA per confermare la cancellazione dei log è:\n\n"
          . "$twofa_code\n\n"
          . "Scade in 5 minuti.\n\n"
          . "IP richiesta: {$_SERVER['REMOTE_ADDR']}";
    sendEmail($admin['email'], $subject, $body);
}

// Risposta JSON
echo json_encode([
    'ok' => true,
    'message' => 'Codice 2FA inviato via email'
]);
