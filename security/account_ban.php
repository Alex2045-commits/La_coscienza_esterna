<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/startSecureAdminSession.php';
require_once __DIR__ . '/../api/auth_middleware.php';
require_once __DIR__ . '/security_logger.php';

startSecureAdminSession();
$admin = auth_require_admin();

header('Content-Type: application/json; charset=utf-8');

$data = json_decode(file_get_contents('php://input'), true);

$userId   = (int)($data['user_id'] ?? 0);
$reason   = trim($data['reason'] ?? 'Violazione sicurezza');
$duration = $data['duration'] ?? '7d';

if ($userId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'INVALID_USER']);
    exit;
}

// Calcolo scadenza UTC
$now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
$until = match ($duration) {
    '1h'    => $now->modify('+1 hour'),
    '24h'   => $now->modify('+24 hours'),
    '7d'    => $now->modify('+7 days'),
    'perma' => new DateTimeImmutable('9999-12-31 23:59:59', new DateTimeZone('UTC')),
    default => $now->modify('+7 days'),
};

// Aggiorna tabella utenti
$stmt = $pdo->prepare("
    UPDATE users
    SET banned_until = :until,
        ban_reason   = :reason
    WHERE id = :id
");
$stmt->execute([
    ':id'    => $userId,
    ':until' => $until->format('Y-m-d H:i:s'),
    ':reason'=> $reason
]);

if ($duration === 'perma') {
    $stmt = $pdo->prepare("
        UPDATE users
        SET deleted_at = NOW(),
            email = NULL,
            username = CONCAT('deleted_', id)
        WHERE id = :id
    ");
    $stmt->execute([':id'=>$userId]);
    $event = 'account_deleted_permanently';
} else {
    $event = 'account_banned_temporarily';
}

// Log sicurezza
security_log($pdo, $userId, $event, ['dangerous_subject'=>true, 'reason'=>$reason]);

// Alert admin
$stmt = $pdo->prepare("
    INSERT INTO admin_alerts(level, message)
    VALUES ('critical', :msg)
");
$msg = $duration === 'perma'
    ? "🚨 Utente ID {$userId} ELIMINATO PERMANENTEMENTE: {$reason}"
    : "⚠️ Utente ID {$userId} bannato {$duration}: {$reason}";
$stmt->execute([':msg'=>$msg]);

// Tempo residuo
$secondsLeft = $until->getTimestamp() - $now->getTimestamp();
$timeLeft = [
    'days'    => max(0,intdiv($secondsLeft,86400)),
    'hours'   => max(0,intdiv($secondsLeft%86400,3600)),
    'minutes' => max(0,intdiv($secondsLeft%3600,60)),
    'seconds' => max(0,$secondsLeft%60),
    'expired' => $secondsLeft <= 0
];

echo json_encode([
    'ok'           => true,
    'user_id'      => $userId,
    'banned_until' => $until->format('Y-m-d H:i:s'),
    'time_left'    => $timeLeft
]);
exit;
