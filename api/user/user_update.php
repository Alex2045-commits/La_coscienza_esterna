<?php
declare(strict_types=1);
require_once __DIR__ . "/../config.php";
require_once __DIR__ . "/auth_middleware.php";
require_once __DIR__ . "/../csrf.php";
require_once __DIR__ . "/../utils.php";
require_once __DIR__ . "/../../security/security_logger.php";

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

// CSRF + login richiesto
auth_require_csrf();
$user = auth_require_user();
$id = (int)$user["id"];

$input = json_decode(file_get_contents("php://input"), true);

$newEmail = trim($input["email"] ?? "");
$newPass  = $input["password"] ?? "";
$currentPass = $input["current_password"] ?? "";

if ($newEmail) {
    if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
        http_response_code(422);
        echo json_encode(["ok" => false, "error" => "EMAIL_NON_VALIDA"]);
        exit;
    }
    $stmt = $pdo->prepare("UPDATE users SET email = :e WHERE id = :id");
    $stmt->execute([":e" => $newEmail, ":id" => $id]);
    
    security_log($pdo, $id, 'user_update_email', [
        'new_email' => hash('sha256', $newEmail),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
    ]);
    log_event($id, 'update_email', "Email changed to: " . hash('sha256', $newEmail));
}

if ($newPass && strlen($newPass) >= 8) {
    $userStmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = :id LIMIT 1");
    $userStmt->execute([":id" => $id]);
    $row = $userStmt->fetch(PDO::FETCH_ASSOC);
    $pepper = $GLOBALS["PASSWORD_PEPPER"] ?? '';
    if (!$row || empty($currentPass) || !password_verify($currentPass . $pepper, (string)$row['password_hash'])) {
        security_log($pdo, $id, 'user_update_password_denied_bad_current_password', [
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
        ]);
        http_response_code(403);
        echo json_encode(["ok" => false, "error" => "CURRENT_PASSWORD_ERRATA"]);
        exit;
    }

    if (!preg_match('/[A-Za-z]/', $newPass) || !preg_match('/\d/', $newPass)) {
        http_response_code(422);
        echo json_encode(["ok" => false, "error" => "PASSWORD_DEBOLE"]);
        exit;
    }

    $hash = password_hash($newPass.$pepper, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("UPDATE users SET password_hash = :p WHERE id = :id");
    $stmt->execute([":p" => $hash, ":id" => $id]);
    
    security_log($pdo, $id, 'user_update_password', [
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
    ]);
    log_event($id, 'update_password', 'Password changed');
}

echo json_encode(["ok" => true, "message" => "Aggiornamento completato"]);
exit;
?>
