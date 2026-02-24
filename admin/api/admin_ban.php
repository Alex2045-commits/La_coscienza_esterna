<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php';

startSecureAdminSession();
auth_require_admin();

$data = json_decode(file_get_contents("php://input"), true);

$userId = (int)($data['user_id'] ?? 0);
$ip     = trim($data['ip'] ?? '');
$reason = $data['reason'] ?? 'Violazione sicurezza';
$duration = $data['duration'] ?? '7d';

if ($userId > 0) {
    require __DIR__ . '/admin_ban_user.php';
    exit;
}

if (filter_var($ip, FILTER_VALIDATE_IP)) {
    require __DIR__ . '/admin_ban_ip.php';
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'NO_TARGET']);
exit;
