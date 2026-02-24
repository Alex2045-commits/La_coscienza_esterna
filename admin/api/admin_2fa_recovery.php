<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

// ============================
// RESET 2FA RECOVERY CODES
// ============================

require_once __DIR__ . '/../../api/utils.php';
require_once __DIR__ . '/../../api/startSecureAdminSession.php';
require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ forza admin + 2FA su localhost

// ============================
// Avvio sessione sicura
// ============================
startSecureAdminSession();
header('Content-Type: application/json; charset=utf-8');

// ============================
// Verifica admin + 2FA
// ============================
$admin = auth_require_admin();

// ============================
// Input POST
// ============================
$userId = filter_input(INPUT_POST, 'user_id', FILTER_VALIDATE_INT);
if (!$userId) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'USER_ID_MISSING']);
    exit;
}

// ❌ Non permettere reset dei propri codici
if ($userId === (int)$admin['id']) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'CANNOT_RESET_SELF']);
    exit;
}

// ============================
// Controllo utente target esistente
// ============================
$stmt = $pdo->prepare("SELECT id, username, role, deleted_at FROM users WHERE id = ?");
$stmt->execute([$userId]);
$target = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$target || $target['deleted_at'] !== null) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'INVALID_USER']);
    exit;
}

// ============================
// Genera 10 codici di recovery (8 char esadecimali)
// ============================
$codes = [];
for ($i = 0; $i < 10; $i++) {
    $codes[] = bin2hex(random_bytes(4));
}

// ============================
// Salva codici nel DB
// ============================
try {
    $stmt = $pdo->prepare("
        UPDATE users
        SET twofa_recovery_codes = :codes
        WHERE id = :id
    ");
    $stmt->execute([
        ':codes' => json_encode($codes),
        ':id' => $userId
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'DB_ERROR', 'message' => $e->getMessage()]);
    exit;
}

// ============================
// Log evento amministrativo
// ============================
log_event($admin['id'], '2fa_recovery_reset', "Reset recovery codes per utente {$userId}");

// ============================
// Risposta JSON
// ============================
echo json_encode([
    'ok' => true,
    'codes' => $codes
]);
exit;
?>