<?php
require_once __DIR__ . '/ip_whitelist.php';

function is_ip_banned(PDO $pdo, string $ip): bool {

    if (is_ip_whitelisted($ip)) {
        return false; // 👑 ADMIN IMMUNE
    }

    $stmt = $pdo->prepare("
        SELECT 1 FROM ip_bans
        WHERE ip = ?
          AND (banned_until IS NULL OR banned_until > NOW())
        LIMIT 1
    ");
    $stmt->execute([$ip]);

    return (bool) $stmt->fetchColumn();
}

function ban_ip(PDO $pdo, string $ip, string $reason): void {
  if (is_ip_whitelisted($ip)) {
    return; // 🚫 non bannabile
  }
  $stmt = $pdo->prepare("SELECT ban_count FROM ip_bans WHERE ip=?");
  $stmt->execute([$ip]);
  $count = $stmt->fetchColumn();

  if (!$count) {
    // primo ban → 1h
    $pdo->prepare("
      INSERT INTO ip_bans (ip, reason, ban_count, expires_at)
      VALUES (?, ?, 1, NOW() + INTERVAL 1 HOUR)
    ")->execute([$ip, $reason]);
    return;
  }

  if ($count == 1) {
    // secondo → 24h
    $pdo->prepare("
      UPDATE ip_bans
      SET ban_count=2, expires_at=NOW() + INTERVAL 24 HOUR
      WHERE ip=?
    ")->execute([$ip]);
    return;
  }

  // terzo → PERMANENTE
  $pdo->prepare("
    UPDATE ip_bans
    SET ban_count=3, permanent=1, expires_at=NULL
    WHERE ip=?
  ")->execute([$ip]);
}
function unban_ip(PDO $pdo, string $ip): void {
    $stmt = $pdo->prepare("DELETE FROM ip_bans WHERE ip=?");
    $stmt->execute([$ip]);
}
function is_user_banned(array $user): bool {
    if (!isset($user['banned_until'])) {
        return false;
    }
    $banned_until = $user['banned_until'];
    if ($banned_until === null) {
        return false;
    }
    $now = new DateTime();
    $ban_time = new DateTime($banned_until);
    return $ban_time > $now;
}
function ban_ip_duration(PDO $pdo, string $ip, int $hours): void {
    $pdo->prepare("
        INSERT INTO ip_bans (ip, expires_at, permanent)
        VALUES (?, NOW() + INTERVAL ? HOUR, 0)
        ON DUPLICATE KEY UPDATE
            expires_at = NOW() + INTERVAL ? HOUR,
            permanent = 0
    ")->execute([$ip, $hours, $hours]);
}

function ban_ip_permanent(PDO $pdo, string $ip): void {
    $pdo->prepare("
        INSERT INTO ip_bans (ip, permanent, expires_at)
        VALUES (?, 1, NULL)
        ON DUPLICATE KEY UPDATE
            permanent = 1,
            expires_at = NULL
    ")->execute([$ip]);
}

?>