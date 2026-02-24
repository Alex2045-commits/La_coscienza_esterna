<?php
declare(strict_types=1);

require_once __DIR__ . '/security_levels.php';
require_once __DIR__ . '/security_notifier.php';

/* ===============================
   SECURITY LOGGER
=============================== */
function security_log(PDO $pdo, ?int $user_id, string $event, array $meta = []): void
{
    if (!empty($meta['from_ws'])) return;

    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $severity = ($event === 'blocked_action_attempt' || ($meta['dangerous_subject'] ?? false))
        ? 'critical'
        : security_severity($event);

    // Anti-duplicate (1 min)
    $stmt = $pdo->prepare("
        SELECT 1 FROM security_logs
        WHERE event = ? AND ip = ? AND created_at > NOW() - INTERVAL 1 MINUTE
        LIMIT 1
    ");
    $stmt->execute([$event, $ip]);
    if ($stmt->fetch()) return;

    // INSERT
    $stmt = $pdo->prepare("
        INSERT INTO security_logs(user_id, event, severity, ip, meta, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
    ");
    $stmt->execute([
        $user_id,
        $event,
        $severity,
        $ip,
        json_encode($meta)
    ]);

    // 🔑 DATI COMPLETI PER REALTIME
    $logId = (int)$pdo->lastInsertId();
    $createdAt = date('Y-m-d H:i:s');

    if ($severity !== 'info') {
        notify_admin_ws([
            'type'  => 'alert',
            'alert' => [
                'id'         => $logId,          // ✅ FONDAMENTALE
                'user_id'    => $user_id,
                'event'      => $event,
                'ip'         => $ip,
                'severity'   => $severity,
                'meta'       => $meta,
                'created_at' => $createdAt,      // ✅ FONDAMENTALE
                'simulation' => $meta['simulated'] ?? false
            ]
        ]);
    }
}
?>