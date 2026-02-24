<?php
declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ bootstrap locale

use OTPHP\TOTP;

// ✅ Avvio sessione sicura
startSecureAdminSession();

// 🔒 Richiama admin con verifica ruolo + 2FA
$admin = auth_require_admin();

$current = auth_require_admin();
ini_set('display_errors', '0');
error_reporting(E_ALL);

header("Content-Type: application/json");

$data = json_decode(file_get_contents("php://input"), true);
$userId = (int)($data['user_id'] ?? 0);

if ($userId <= 0) {
    http_response_code(400);
    echo json_encode(["error"=>"INVALID_USER"]);
    exit;
}

// 🔑 nuovo secret
$totp = TOTP::create();
$totp->setLabel("La Coscienza Esterna");
$secret = $totp->getSecret();
$uri    = $totp->getProvisioningUri();

// reset DB
$pdo->prepare("
    UPDATE users SET
        twofa_secret = ?,
        twofa_attempts = 0,
        twofa_locked_until = NULL
    WHERE id = ?
")->execute([$secret, $userId]);

$qr = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" . urlencode($uri);

echo json_encode([
    "ok"     => true,
    "secret" => $secret,
    "qr"     => $qr
]);
exit;
?>