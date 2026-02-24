<?php
declare(strict_types=1);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/utils.php";
require_once __DIR__ . "/security_request_guard.php";
require_once __DIR__ . '/../security/security_logger.php';

header("Content-Type: application/json; charset=utf-8");
$allowedOrigins = ["http://localhost:4000", "http://localhost:8000"];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Vary: Origin");
}
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'METHOD_NOT_ALLOWED']);
    exit;
}

security_guard_block_payload_attacks($pdo);

try {
    $data = json_decode((string)file_get_contents("php://input"), true);
    $token = trim((string)($data['token'] ?? ''));
    $newPassword = (string)($data['password'] ?? '');

    if ($token === '' || $newPassword === '') {
        http_response_code(400);
        throw new Exception("Token o password mancanti");
    }
    if (strlen($newPassword) < 8 || !preg_match('/[A-Za-z]/', $newPassword) || !preg_match('/\d/', $newPassword)) {
        http_response_code(422);
        throw new Exception("Password debole: minimo 8 caratteri con almeno una lettera e un numero");
    }

    $tokenHash = hash('sha256', $token);
    $stmt = $pdo->prepare("
        SELECT pr.user_id, u.username
        FROM password_resets pr
        JOIN users u ON pr.user_id = u.id
        WHERE pr.token_hash = ? AND pr.expires_at > NOW()
        LIMIT 1
    ");
    $stmt->execute([$tokenHash]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        http_response_code(400);
        throw new Exception("Token non valido o scaduto");
    }

    $pepper = $GLOBALS['PASSWORD_PEPPER'] ?? '';
    $passwordHash = password_hash($newPassword . $pepper, PASSWORD_ARGON2ID);

    $stmt = $pdo->prepare("UPDATE users SET password_hash = ?, updated_at = NOW(), last_activity = NOW() WHERE id = ?");
    $stmt->execute([$passwordHash, (int)$user['user_id']]);

    $stmt = $pdo->prepare("DELETE FROM password_resets WHERE user_id = ?");
    $stmt->execute([(int)$user['user_id']]);

    add_notification((int)$user['user_id'], "Sicurezza: password cambiata con successo.");
    security_log($pdo, (int)$user['user_id'], 'password_reset_success', [
        'ip' => $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown'
    ]);

    echo json_encode([
        'ok' => true,
        'message' => "Password aggiornata con successo",
        'username' => $user['username']
    ]);
} catch (Throwable $e) {
    error_log("reset_password.php error: " . $e->getMessage());
    if (http_response_code() < 400) http_response_code(400);
    echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
}
