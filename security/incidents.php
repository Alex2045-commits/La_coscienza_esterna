<?php
declare(strict_types=1);

function check_incident(PDO $pdo, string $event, string $ip): void {
    if (is_ip_whitelisted($ip)) {
        return;
    }

    // solo per eventi rilevanti
    if ($event !== 'security_bruteforce') return;

    // quante volte negli ultimi 10 minuti?
    $stmt = $pdo->prepare("
        SELECT COUNT(*) 
        FROM security_logs
        WHERE ip = ?
          AND event = 'security_bruteforce'
          AND created_at > NOW() - INTERVAL 10 MINUTE
    ");
    $stmt->execute([$ip]);

    $count = (int)$stmt->fetchColumn();

    if ($count < 5) return;

    // esiste già un incidente aperto?
    $check = $pdo->prepare("
        SELECT id FROM security_incidents
        WHERE source_ip = ?
          AND status = 'open'
          AND type = 'bruteforce'
        LIMIT 1
    ");
    $check->execute([$ip]);

    if ($check->fetch()) {
        // aggiorna last_seen
        $pdo->prepare("
            UPDATE security_incidents
            SET last_seen = NOW()
            WHERE source_ip = ? AND status = 'open'
        ")->execute([$ip]);
        return;
    }

    // crea nuovo incidente
    $pdo->prepare("
        INSERT INTO security_incidents
        (type, severity, source_ip, status, first_seen, last_seen)
        VALUES ('bruteforce', 'critical', ?, 'open', NOW(), NOW())
    ")->execute([$ip]);
}
?>