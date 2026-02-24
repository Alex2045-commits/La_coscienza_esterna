<?php
require_once __DIR__ . '/../../../api/auth_middleware.php';
require_once __DIR__ . '/../../../api/startSecureAdminSession.php';

header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: http://localhost:4000");
header("Access-Control-Allow-Credentials: true");

startSecureAdminSession();

$_SESSION['admin_id'] = (int)$user['id'];

if (!$admin_id) {
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "Not authenticated"]);
    exit;
}

// Recupera input JSON
$input = json_decode(file_get_contents("php://input"), true);

// Valida log_id
$log_id = $input['log_id'] ?? null;
if ($log_id === null || !is_numeric($log_id) || intval($log_id) <= 0) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "Invalid or missing log_id"]);
    exit;
}
$log_id = intval($log_id);

try {
    // Inserimento con IGNORE evita duplicati
    $stmt = $pdo->prepare("INSERT IGNORE INTO security_read_logs (admin_id, log_id) VALUES (?, ?)");
    $stmt->execute([$admin_id, $log_id]);

    echo json_encode(["ok" => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => $e->getMessage()]);
}