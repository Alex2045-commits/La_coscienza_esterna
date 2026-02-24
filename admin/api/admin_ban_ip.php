<?php
declare(strict_types=1);

require_once __DIR__ . "/../../api/auth_middleware.php";
require_once __DIR__ . "/../../api/startSecureSession.php";
require_once __DIR__ . "/boostrap_local_admin.php";

startSecureAdminSession();
$admin = auth_require_admin();

$pdo = $GLOBALS['pdo'] ?? null;
if (!$pdo) {
    http_response_code(500);
    echo json_encode(['error'=>'PDO_NOT_INITIALIZED']);
    exit;
}

// Leggi input JSON
$data     = json_decode(file_get_contents("php://input"), true);
$ip       = isset($data['ip']) ? trim($data['ip']) : null;
$userId   = isset($data['user_id']) ? (int)$data['user_id'] : 0;
$duration = $data['duration'] ?? '7d';
$reason   = trim($data['reason'] ?? 'Violazione sicurezza');

// Calcola scadenza ban
$until = match ($duration) {
    '1h'    => date('Y-m-d H:i:s', time()+3600),
    '24h'   => date('Y-m-d H:i:s', time()+86400),
    '7d'    => date('Y-m-d H:i:s', time()+604800),
    'perma' => '9999-12-31 23:59:59',
    default => date('Y-m-d H:i:s', time()+604800),
};

// Validazioni IP
if ($ip !== null && $ip !== '' && !filter_var($ip, FILTER_VALIDATE_IP)) {
    http_response_code(400);
    echo json_encode(['error' => 'INVALID_IP']);
    exit;
}

// Proteggi admin e test user
if ($userId === 1 || $userId === 9999) {
    http_response_code(403);
    echo json_encode(['error'=>'PROTECTED_USER']);
    exit;
}

try {

    if ($ip) {
        // Ban IP
        $stmt = $pdo->prepare("
            INSERT INTO banned_ips (ip, banned_until, reason)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE banned_until = VALUES(banned_until), reason = VALUES(reason)
        ");
        $stmt->execute([$ip, $until, $reason]);

        // Log sicurezza
        $stmt = $pdo->prepare("
            INSERT INTO security_audit (event, ip)
            VALUES (?, ?)
        ");
        $stmt->execute(['ip_banned', $ip]);

        // Alert admin
        $stmt = $pdo->prepare("
            INSERT INTO admin_alerts (level, message)
            VALUES ('critical', ?)
        ");
        $stmt->execute(["🚫 IP {$ip} bannato ({$duration}) — {$reason}"]);

        // Realtime payload (da usare per WS/SSE)
        $alertData = [
            'type' => 'ip',
            'event' => 'ip_banned',
            'ip' => $ip,
            'duration' => $duration,
            'reason' => $reason,
            'created_at' => gmdate('Y-m-d H:i:s')
        ];
        if ($duration === 'perma') {
            $stmt = $pdo->prepare("
                UPDATE users
                SET deleted_at = NOW(),
                    email      = NULL,
                    username   = CONCAT('deleted_', id)
                WHERE id = :id
            ");
            $stmt->execute([':id' => $userId]);
            $event = "account_deleted_permanently:$userId con ip";
        } else {
            $event = "account_banned:$userId con ip";
        }
        
        echo json_encode(['ok' => true, 'type' => 'ip', 'alert' => $alertData]);
        exit;
    }

    if ($userId) {
        // Ban utente
        $stmt = $pdo->prepare("
            UPDATE users SET banned_until = ?, ban_reason = ?
            WHERE id = ?
        ");
        $stmt->execute([$until, $reason, $userId]);

        // Log sicurezza
        $stmt = $pdo->prepare("
            INSERT INTO security_audit (event, user_id, ip)
            VALUES (?, ?, ?)
        ");
        $stmt->execute(['user_banned', $userId, 'admin']);

        // Alert admin
        $stmt = $pdo->prepare("
            INSERT INTO admin_alerts (level, message)
            VALUES ('critical', ?)
        ");
        $stmt->execute(["🚫 Utente ID {$userId} bannato ({$duration}) — {$reason}"]);

        // Realtime payload
        $alertData = [
            'type' => 'user',
            'event' => 'user_banned',
            'user_id' => $userId,
            'duration' => $duration,
            'reason' => $reason,
            'created_at' => gmdate('Y-m-d H:i:s')
        ];
        if ($duration === 'perma') {
            $stmt = $pdo->prepare("
                UPDATE users
                SET deleted_at = NOW(),
                    email      = NULL,
                    username   = CONCAT('deleted_', id)
                WHERE id = :id
            ");
            $stmt->execute([':id' => $userId]);
            $event = "account_deleted_permanently:$userId con ip";
        } else {
            $event = "account_banned:$userId con ip";
        }

        $meta = [
            'duration' => $duration,
            'reason'   => $reason,
            'admin_id' => $admin['id']
        ];

        security_log($pdo, $admin['id'], $event, $meta); // ✅ registra su security_logs

        echo json_encode(['ok' => true, 'type' => 'user', 'alert' => $alertData]);
        exit;
    }

    // Se non viene passato né IP né userId
    http_response_code(400);
    echo json_encode(['error'=>'MISSING_TARGET']);
    exit;

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok'=>false, 'error'=>'DB_ERROR', 'msg'=>$e->getMessage()]);
    exit;
}