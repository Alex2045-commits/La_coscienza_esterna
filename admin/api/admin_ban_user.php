<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php';
require_once __DIR__ . '/../../security/security_logger.php'; // ✅ include security_log

header('Content-Type: application/json; charset=utf-8');
if (isLocalhost()) {
    header("Access-Control-Allow-Origin: http://localhost:8000");
    header("Access-Control-Allow-Credentials: true");
}

// ===== SESSIONE & AUTH =====
startSecureAdminSession();
$admin = auth_require_admin();

// ===== INPUT =====
$data = json_decode(file_get_contents("php://input"), true);
$userId   = (int)($data['user_id'] ?? 0);
$reason   = trim($data['reason'] ?? 'Violazione sicurezza');
$duration = $data['duration'] ?? '7d'; // '1h', '24h', '7d', 'perma'

// ===== VALIDAZIONI =====
if ($userId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'INVALID_USER']);
    exit;
}
if ($userId === 1 || $userId === 9999) {
    http_response_code(403);
    echo json_encode(['error' => 'PROTECTED_USER']);
    exit;
}

// ===== ORARIO UNICO (UTC) =====
$now = new DateTimeImmutable('now', new DateTimeZone('UTC'));

// ===== CALCOLO SCADENZA =====
$until = match ($duration) {
    '1h'    => $now->modify('+1 hour'),
    '24h'   => $now->modify('+24 hours'),
    '7d'    => $now->modify('+7 days'),
    'perma' => new DateTimeImmutable('9999-12-31 23:59:59', new DateTimeZone('UTC')),
    default => $now->modify('+7 days'),
};

// ===== BAN UTENTE =====
$stmt = $pdo->prepare("
    UPDATE users
    SET banned_until = :until,
        ban_reason   = :reason
    WHERE id = :id
");
$stmt->execute([
    ':id'     => $userId,
    ':until'  => $until->format('Y-m-d H:i:s'),
    ':reason' => $reason
]);

// ===== SOFT DELETE SE PERMANENTE =====
if ($duration === 'perma') {
    $stmt = $pdo->prepare("
        UPDATE users
        SET deleted_at = NOW(),
            email      = NULL,
            username   = CONCAT('deleted_', id)
        WHERE id = :id
    ");
    $stmt->execute([':id' => $userId]);
    $event = "account_deleted_permanently:$userId";
} else {
    $event = "account_banned_temporarily:$userId";
}

// ===== LOG SICUREZZA =====
try {
    $meta = [
        'duration' => $duration,
        'reason'   => $reason,
        'admin_id' => $admin['id']
    ];
    security_log($pdo, $admin['id'], $event, $meta); // ✅ registra su security_logs
} catch (PDOException $e) {
    error_log("❌ Errore security_log: " . $e->getMessage());
}

// ===== ALERT ADMIN =====
try {
    $stmt = $pdo->prepare("
        INSERT INTO admin_alerts (level, message)
        VALUES ('critical', :msg)
    ");
    $msg = $duration === 'perma'
        ? "🚨 Utente ID {$userId} ELIMINATO PERMANENTEMENTE: {$reason}"
        : "⚠️ Utente ID {$userId} bannato {$duration}: {$reason}";
    $stmt->execute([':msg' => $msg]);
} catch (PDOException $e) {
    error_log("❌ Errore admin_alerts: " . $e->getMessage());
}

// ===== TEMPO RESIDUO =====
$secondsLeft = $until->getTimestamp() - $now->getTimestamp();
$timeLeft = [
    'days'    => max(0, intdiv($secondsLeft, 86400)),
    'hours'   => max(0, intdiv($secondsLeft % 86400, 3600)),
    'minutes' => max(0, intdiv($secondsLeft % 3600, 60)),
    'seconds' => max(0, $secondsLeft % 60),
    'expired' => $secondsLeft <= 0
];

// ===== RISPOSTA JSON =====
echo json_encode([
    'ok'           => true,
    'user_id'      => $userId,
    'banned_until' => $until->format('Y-m-d H:i:s'),
    'time_left'    => $timeLeft
]);
exit;
