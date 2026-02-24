<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../boostrap_local_admin.php';
require_once __DIR__ . '/../../../api/csrf.php';
require_once __DIR__ . '/../../../api/config.php';
require_once __DIR__ . '/../../../api/auth_middleware.php';
require_once __DIR__ . '/../../../api/mail.php';
require_once __DIR__ . '/../../../security/security_logger.php'; // log_event

startSecureAdminSession();
$admin = auth_require_admin();   // sessione admin valida
auth_require_csrf();

header('Content-Type: application/json; charset=utf-8');


$input = json_decode(file_get_contents("php://input"), true);
$code  = trim($input['code'] ?? '');

// Controlla esistenza e validità 2FA
if (empty($code) || empty($_SESSION['clear_2fa']) || empty($_SESSION['clear_2fa_expires'])) {
    http_response_code(403);
    echo json_encode(['ok'=>false, 'error'=>'2FA_INVALID']);
    exit;
}

// Controlla scadenza
if (time() > $_SESSION['clear_2fa_expires']) {
    unset($_SESSION['clear_2fa'], $_SESSION['clear_2fa_expires']);
    http_response_code(403);
    echo json_encode(['ok'=>false, 'error'=>'2FA_EXPIRED']);
    exit;
}

// Verifica codice
if (!password_verify($code, $_SESSION['clear_2fa'])) {
    http_response_code(403);
    echo json_encode(['ok'=>false, 'error'=>'2FA_WRONG']);
    exit;
}

// Elimina log
$stmt = $pdo->prepare("DELETE FROM logs");
$stmt->execute();
$deleted = $stmt->rowCount();

// Log evento sicurezza
if (function_exists('log_event')) {
    log_event($admin['id'], "logs_cleared", ['deleted' => $deleted]);
}

// Invia email conferma
if (!empty($admin['email'])) {
    $subject = "✔ Log eliminati";
    $body = "Ciao {$admin['username']},\n\n"
          . "Sono stati eliminati $deleted log dal pannello admin.\n"
          . "IP richiesta: {$_SERVER['REMOTE_ADDR']}";
    sendEmail($admin['email'], $subject, $body);
}

// Pulisci sessione 2FA
unset($_SESSION['clear_2fa'], $_SESSION['clear_2fa_expires']);

echo json_encode(['ok'=>true, 'deleted'=>$deleted]);
