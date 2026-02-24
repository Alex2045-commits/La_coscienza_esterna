<?php
require_once __DIR__ . '/../api/config.php';

function create_admin_alert(PDO $pdo, string $level, string $msg): void {
  $pdo->prepare("
    INSERT INTO admin_alerts (level, message)
    VALUES (:l,:m)
  ")->execute([':l'=>$level, ':m'=>$msg]);
}
?>