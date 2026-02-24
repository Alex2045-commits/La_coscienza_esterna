<?php
declare(strict_types=1);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/mail.php";
require_once __DIR__ . "/utils.php";
require_once __DIR__ . "/security_request_guard.php";

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

// Risposta sempre generica per evitare user enumeration
$genericResponse = ['ok' => true, 'message' => "Se l'account esiste, riceverai una mail di reset."];

try {
    $data = json_decode((string)file_get_contents("php://input"), true);
    $identifier = trim((string)($data['username'] ?? ''));
    if ($identifier === '') {
        echo json_encode($genericResponse);
        exit;
    }

    $stmt = $pdo->prepare("SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1");
    $stmt->execute([$identifier, $identifier]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        echo json_encode($genericResponse);
        exit;
    }

    $token = bin2hex(random_bytes(16));
    $tokenHash = hash('sha256', $token);

    $stmt = $pdo->prepare("
        INSERT INTO password_resets (user_id, token_hash, expires_at)
        VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
    ");
    $stmt->execute([(int)$user['id'], $tokenHash]);

    $appUrl = rtrim((string)(env('APP_URL_FRONT') ?: 'http://localhost:4000'), '/');
    $resetUrl = "{$appUrl}/reset/reset_password.html?token={$token}";

    $htmlBody = "
    <html><body>
      <p>Ciao " . htmlspecialchars((string)$user['username'], ENT_QUOTES, 'UTF-8') . ",</p>
      <p>Abbiamo ricevuto una richiesta di reset password.</p>
      <p><a href='{$resetUrl}'>Reimposta password</a></p>
      <p>Il link e valido per 1 ora. Se non sei stato tu, ignora questa email.</p>
      <p>La Coscienza Esterna</p>
    </body></html>";

    sendEmail((string)$user['email'], "Reset password La Coscienza Esterna", $htmlBody, true);
    add_notification((int)$user['id'], "Sicurezza: richiesta di reset password ricevuta.");

    echo json_encode($genericResponse);
} catch (Throwable $e) {
    error_log("forgot_password.php error: " . $e->getMessage());
    // Risposta generica anche in errore
    echo json_encode($genericResponse);
}
