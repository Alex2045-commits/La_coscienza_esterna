<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/utils.php';
require_once __DIR__ . '/mail.php';
require_once __DIR__ . '/email_verification_lib.php';
require_once __DIR__ . '/security_request_guard.php';
require_once __DIR__ . '/../security/security_logger.php';

header("Content-Type: application/json; charset=utf-8");
$allowedOrigins = ["http://localhost:4000", "http://localhost:8000"];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Vary: Origin");
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Credentials: true");

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'METHOD_NOT_ALLOWED']);
    exit;
}

security_guard_block_payload_attacks($pdo);

try {
    $input = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'INVALID_JSON']);
        exit;
    }

    $username = trim((string)($input['username'] ?? ''));
    $email = trim((string)($input['email'] ?? ''));
    $password = (string)($input['password'] ?? '');

    if ($username === '' || $email === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Tutti i campi sono obbligatori']);
        exit;
    }

    if (!preg_match('/^[a-zA-Z0-9._-]{3,50}$/', $username)) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Username non valido']);
        exit;
    }

    if (containsOffensiveWord($username)) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Username non consentito']);
        exit;
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Email non valida']);
        exit;
    }

    if (strlen($password) < 8 || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Password debole: minimo 8 caratteri con almeno una lettera e un numero']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT 1 FROM users WHERE username = :u OR email = :e LIMIT 1");
    $stmt->execute([':u' => $username, ':e' => $email]);
    if ($stmt->fetchColumn()) {
        http_response_code(409);
        echo json_encode(['ok' => false, 'error' => 'Username o email gia in uso']);
        exit;
    }

    $pepper = $GLOBALS['PASSWORD_PEPPER'] ?? '';
    $hash = password_hash($password . $pepper, PASSWORD_ARGON2ID);

    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        INSERT INTO users (username, email, password_hash, role, created_at)
        VALUES (:u, :e, :p, 'user', NOW())
    ");
    $stmt->execute([':u' => $username, ':e' => $email, ':p' => $hash]);
    $userId = (int)$pdo->lastInsertId();

    ensureEmailVerificationTable($pdo);
    $code = issueEmailVerificationCode($pdo, $userId, $email, 600);

    $safeUsername = htmlspecialchars($username, ENT_QUOTES, 'UTF-8');
    $mailBody = "
        <h2>Verifica il tuo account La Coscienza Esterna</h2>
        <p>Ciao <strong>{$safeUsername}</strong>,</p>
        <p>il tuo codice di verifica e:</p>
        <p style=\"font-size:24px;font-weight:700;letter-spacing:2px;\">{$code}</p>
        <p>Scade in 10 minuti.</p>
    ";
    sendEmail($email, 'Verifica email - La Coscienza Esterna', $mailBody);

    add_notification($userId, "Sicurezza: account creato, verifica email in attesa.");
    security_log($pdo, $userId, 'user_registered', [
        'ip' => $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown'
    ]);
    security_log($pdo, $userId, 'email_verification_sent', [
        'ip' => $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'
    ]);

    $pdo->commit();

    echo json_encode([
        'ok' => true,
        'verify_required' => true,
        'user_id' => $userId,
        'message' => 'Registrazione completata. Verifica email richiesta.'
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("register.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'SERVER_ERROR']);
}
?>
