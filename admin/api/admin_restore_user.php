<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ bootstrap locale

// 🔒 Richiama admin con verifica ruolo + 2FA
$admin = auth_require_admin();

$data = json_decode(file_get_contents("php://input"), true);
$id = $data['id'] ?? null;

if (!$id) {
  http_response_code(400);
  exit;
}

$pdo->prepare("
  UPDATE users
  SET deleted_at = NULL,
      purge_at = NULL
  WHERE id = ?
")->execute([$id]);

echo json_encode(["ok"=>true]);
?>