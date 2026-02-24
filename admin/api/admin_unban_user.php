<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ bootstrap locale

// 🔒 Richiama admin con verifica ruolo + 2FA
$admin = auth_require_admin();

header("Content-Type: application/json; charset=utf-8");
if(isLocalhost()) {
    header("Access-Control-Allow-Origin: http://localhost:8000");
    header("Access-Control-Allow-Credentials: true");
}

$admin = auth_require_admin();

$data = json_decode(file_get_contents("php://input"), true);
$userId = (int)($data['id'] ?? 0);

if (!$userId) {
    http_response_code(400);
    exit(json_encode(["ok"=>false,"error"=>"BAD_REQUEST"]));
}

if ($userId === (int)$admin['id']) {
    http_response_code(403);
    exit(json_encode(["ok"=>false,"error"=>"CANNOT_MODIFY_SELF"]));
}

$st = $pdo->prepare("
    SELECT id, banned_until
    FROM users
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1
");
$st->execute([$userId]);
$user = $st->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    http_response_code(404);
    exit(json_encode(["ok"=>false,"error"=>"USER_NOT_FOUND"]));
}

/* 🛑 BLOCCA UNBAN PER BAN PERMANENTE */
if ($user['banned_until'] === '9999-12-31 23:59:59' || $user['deleted_at'] !== null) {
    http_response_code(403);
    exit(json_encode(["ok"=>false,"error"=>"PERMANENT_BAN"]));
}

/* 🔓 UNBAN */
$pdo->prepare("
    UPDATE users
    SET banned_until = NULL
    WHERE id = ?
")->execute([$userId]);

security_log($pdo, $admin['id'], "admin_unban_user:$userId");
$pdo->prepare("
  INSERT INTO admin_alerts (level, message, created_at)
  VALUES ('critical', ?, NOW())
")->execute([
  "Evento sicurezza: $event"
]);


echo json_encode(["ok"=>true]);
?>