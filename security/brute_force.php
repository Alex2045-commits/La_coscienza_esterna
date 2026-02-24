<?php
function too_many_attempts(PDO $pdo, string $ip): bool {
    
  if (is_ip_whitelisted($ip)) {
    security_log($pdo, null, 'security_bruteforce_ignored', [
      'ip' => $ip,
      'reason' => 'whitelisted'
    ]);
  }
    $stmt = $pdo->prepare("
        SELECT COUNT(*) 
        FROM security_logs
        WHERE ip = ?
          AND event = 'login_failed'
          AND created_at > NOW() - INTERVAL 10 MINUTE
    ");
    $stmt->execute([$ip]);
    return $stmt->fetchColumn() >= 5;
}

function register_attempt(PDO $pdo, string $ip): void {
  $pdo->prepare("
    INSERT INTO login_attempts (ip, attempts)
    VALUES (:ip,1)
    ON DUPLICATE KEY UPDATE
      attempts = attempts + 1,
      last_attempt = NOW()
  ")->execute([':ip'=>$ip]);
}
function clear_attempts(PDO $pdo, string $ip): void {
  $stmt = $pdo->prepare("
    DELETE FROM login_attempts
    WHERE ip = :ip
  ");
  $stmt->execute([':ip'=>$ip]);
}
?>