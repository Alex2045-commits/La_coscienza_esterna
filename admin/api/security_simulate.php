<?php
declare(strict_types=1);

require_once __DIR__ . "/../../api/auth_middleware.php";
require_once __DIR__ . "/../../api/startSecureSession.php";
require_once __DIR__ . "/../../security/security_logger.php";
require_once __DIR__ . "/../../api/config.php";
require_once __DIR__ . "/../../api/utils.php";

startSecureSession();

// 🔒 Richiama admin loggato
$admin = auth_require_admin();
$adminId = $admin['id'] ?? 0;

$data  = json_decode(file_get_contents("php://input"), true);
$event = $data['event'] ?? null;

if (!$event || !in_array($event, SECURITY_SIMULATION_EVENTS, true)) {
    addLog(
        'security',
        $adminId,
        'invalid_security_simulation',
        "Tentativo evento non consentito: " . ($event ?? 'null')
    );

    http_response_code(403);
    echo json_encode(['error' => 'EVENT_NOT_ALLOWED']);
    exit;
}

addLog(
    'security',
    $adminId,
    'valid_security_simulation',
    "Tentativo event consentito: " . ($event ?? 'null')
);

$log = [
    'id' => uniqid('sim_', true), // ID fittizio ma unico
    'user_id' => rand(2, 50),
    'event' => $event,
    'ip' => '185.220.101.45',
    'created_at' => date('Y-m-d H:i:s'),
    'simulation' => true
];

security_log(
    $pdo,
    $log['user_id'],
    $event,
    [
        'simulated' => true,
        'ip' => $log['ip'],
        'country' => 'RU',
        'user_agent' => 'curl/7.88.1',
        'note' => 'Evento simulato da admin',
        'created_at' => $log['created_at']
    ]
);

echo json_encode([
    'ok'  => true,
    'log' => $log
]);