<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ bootstrap locale

// ✅ Avvio sessione sicura
startSecureAdminSession();

// 🔒 Richiama admin con verifica ruolo + 2FA
$admin = auth_require_admin();

use OTPHP\TOTP;
use ParagonIE\ConstantTime\Base32;

header("Content-Type: application/json; charset=utf-8");

// 🔹 recupera user_id (POST o GET)
$userId = (int)($_POST['user_id'] ?? $_GET['user_id'] ?? 0);

if ($userId <= 0) {
    http_response_code(400);
    echo json_encode(["error" => "INVALID_USER"]);
    exit;
}

// 🔹 carica utente
$stmt = $pdo->prepare("
    SELECT id, username
    FROM users
    WHERE id = ?
    LIMIT 1
");
$stmt->execute([$userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    http_response_code(404);
    echo json_encode(["error" => "USER_NOT_FOUND"]);
    exit;
}

/* =========================
   🔑 GENERA SECRET (32 CHAR)
========================= */
$secret = Base32::encodeUpper(random_bytes(20)); // 32 base32
$totp   = TOTP::createFromSecret($secret);

$totp->setLabel("La Coscienza Esterna ({$user['username']})");
$totp->setIssuer("La Coscienza Esterna");

$uri = $totp->getProvisioningUri();

/* =========================
   💾 SALVA NEL DB
========================= */
$pdo->prepare("
    UPDATE users
    SET twofa_secret = ?
    WHERE id = ?
")->execute([$secret, $user['id']]);

/* =========================
   📤 OUTPUT
========================= */
echo json_encode([
    "ok"     => true,
    "secret" => $secret,
    "qr"     => "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" . urlencode($uri)
]);

exit;
?>