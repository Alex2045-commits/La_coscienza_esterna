<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mail.php';
require_once __DIR__ . '/email_verification_lib.php';
require_once __DIR__ . '/../security/security_logger.php';

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: http://localhost:4000");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'METHOD_NOT_ALLOWED']);
    exit;
}

ensureEmailVerificationTable($pdo);
$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'INVALID_JSON']);
    exit;
}

$userId = (int)($input['user_id'] ?? 0);
$resend = !empty($input['resend']);
$code = trim((string)($input['code'] ?? ''));

if ($userId <= 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'INVALID_USER']);
    exit;
}

$stmt = $pdo->prepare("SELECT id, username, email, role FROM users WHERE id = :id LIMIT 1");
$stmt->execute([':id' => $userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$user || ($user['role'] ?? '') !== 'user') {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'USER_NOT_FOUND']);
    exit;
}

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

if ($resend) {
    if (!canResendEmailVerification($pdo, $userId, 60)) {
        http_response_code(429);
        echo json_encode(['ok' => false, 'error' => 'RESEND_COOLDOWN']);
        exit;
    }
    $newCode = issueEmailVerificationCode($pdo, $userId, (string)$user['email'], 600);
    $safeUsername = htmlspecialchars((string)$user['username'], ENT_QUOTES, 'UTF-8');
    $mailBody = "
        <h2>Verifica il tuo account La Coscienza Esterna</h2>
        <p>Ciao <strong>{$safeUsername}</strong>,</p>
        <p>il tuo codice di verifica e:</p>
        <p style=\"font-size:24px;font-weight:700;letter-spacing:2px;\">{$newCode}</p>
        <p>Scade in 10 minuti.</p>
    ";
    sendEmail((string)$user['email'], 'Verifica email - La Coscienza Esterna', $mailBody);
    security_log($pdo, $userId, 'email_verification_resent', ['ip' => $ip]);
    echo json_encode(['ok' => true, 'resent' => true]);
    exit;
}

if ($code === '' || !preg_match('/^\d{6}$/', $code)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'INVALID_CODE_FORMAT']);
    exit;
}

$result = verifyEmailCode($pdo, $userId, $code);
if (empty($result['ok'])) {
    $err = (string)($result['error'] ?? 'VERIFY_FAILED');
    $status = match ($err) {
        'CODE_EXPIRED' => 410,
        'TOO_MANY_ATTEMPTS' => 429,
        'INVALID_CODE' => 401,
        default => 400
    };
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $err]);
    exit;
}

security_log($pdo, $userId, 'email_verified', ['ip' => $ip]);
add_notification($userId, "Sicurezza: email verificata con successo.");
echo json_encode(['ok' => true, 'verified' => true]);
