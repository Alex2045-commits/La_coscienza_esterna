<?php
require_once __DIR__ . '/../api/config.php'; // assicurati che $pdo sia inizializzato

$stmt = $pdo->prepare("
    INSERT INTO security_logs
    (user_id, event, severity, ip, meta, created_at)
    VALUES (?, ?, ?, ?, ?, NOW())
");

$stmt->execute([
    999,                     // user_id
    'test_login',            // event
    'critical',              // severity
    '127.0.0.1',             // ip
    json_encode(['note'=>'Test log']) // meta
]);

echo "Log inserito!";
