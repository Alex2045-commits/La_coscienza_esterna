<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '../../api/startSecureAdminSession.php';
require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ bootstrap locale

use OTPHP\TOTP;

// ==================== Avvio sessione sicura ====================
startSecureAdminSession();

// ==================== Controllo admin ====================
$admin = auth_require_admin(); // controllerà ruolo + 2FA (su localhost passa subito)

// ==================== Header JSON ====================
header('Content-Type: application/json; charset=utf-8');

// ==================== Input JSON ====================
$data = json_decode(file_get_contents("php://input"), true);
$code = trim($data['code'] ?? '');

// ==================== Gestione localhost ====================
if (isLocalhost()) {
    // In locale bypass del codice TOTP
    $_SESSION['admin_2fa_verified'] = true;
    echo json_encode(['ok' => true, 'message' => '2FA abilitata (localhost)']);
    exit;
}

// ==================== Controllo codice TOTP ====================
if ($code === '') {
    http_response_code(400);
    echo json_encode(['error' => 'CODE_REQUIRED']);
    exit;
}

// ==================== Recupera secret dal DB ====================
$stmt = $pdo->prepare("SELECT twofa_secret FROM users WHERE id = ?");
$stmt->execute([$admin['id']]);
$secret = $stmt->fetchColumn();

if (!$secret) {
    http_response_code(400);
    echo json_encode(['error' => 'NO_SECRET']);
    exit;
}

// ==================== Verifica TOTP ====================
$totp = TOTP::create($secret);

// ±1 intervallo di tolleranza per la sincronizzazione dell’orologio
if (!$totp->verify($code, null, 1)) {
    http_response_code(401);
    echo json_encode(["error" => "INVALID_TOTP"]);
    exit;
}

// ==================== Abilita 2FA nel DB ====================
$pdo->prepare("UPDATE users SET twofa_enabled = 1 WHERE id = ?")
    ->execute([$admin['id']]);

// ==================== Aggiorna sessione ====================
$_SESSION['admin_2fa_verified'] = true;

// ==================== Log evento ====================
log_event($admin['id'], '2fa_enable', "2FA abilitata per admin {$admin['id']}");

// ==================== Risposta JSON ====================
echo json_encode([
    'ok' => true,
    'message' => '2FA abilitata correttamente'
]);
exit;
?>