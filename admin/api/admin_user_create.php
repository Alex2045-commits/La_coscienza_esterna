<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

header("Content-Type: application/json; charset=utf-8");
if(isLocalhost()) {
    header("Access-Control-Allow-Origin: http://localhost:8000");
    header("Access-Control-Allow-Credentials: true");
}

require_once __DIR__ . "/../../api/utils.php";
require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ bootstrap locale

// 🔒 Richiama admin con verifica ruolo + 2FA
$admin = auth_require_admin();

// ======================================================
// Controllo CSRF
// ======================================================
auth_require_csrf();

// ======================================================
// INPUT JSON
// ======================================================
$data = json_decode(file_get_contents("php://input"), true);

$username = trim($data["username"] ?? "");
$email    = trim($data["email"] ?? "");
$pwd      = $data["password"] ?? "";
$role     = $data["role"] ?? "user";

// ======================================================
// Validazioni
// ======================================================
if ($username === "" || $email === "" || $pwd === "") {
    http_response_code(400);
    echo json_encode(["error" => "DATI_MANCANTI"]);
    exit;
}

if (!in_array($role, ["user", "admin"], true)) {
    http_response_code(400);
    echo json_encode(["error" => "RUOLO_INVALIDO"]);
    exit;
}

// Controllo duplicati
$stmt = $pdo->prepare("
    SELECT id FROM users 
    WHERE (username = :u OR email = :e) 
    AND deleted_at IS NULL 
    LIMIT 1
");
$stmt->execute([":u" => $username, ":e" => $email]);

if ($stmt->fetch()) {
    http_response_code(400);
    echo json_encode(["error" => "USERNAME_O_EMAIL_ESISTE"]);
    exit;
}

// ======================================================
// Hash password
// ======================================================
$hash = password_hash($pwd . $GLOBALS["PASSWORD_PEPPER"], PASSWORD_DEFAULT);

// ======================================================
// Inserimento nuovo utente
// ======================================================
$stmt = $pdo->prepare("
    INSERT INTO users (username, email, password_hash, role)
    VALUES (:u, :e, :p, :r)
");

$stmt->execute([
    ":u" => $username,
    ":e" => $email,
    ":p" => $hash,
    ":r" => $role
]);

$newId = (int) $pdo->lastInsertId();

// ======================================================
// Log evento amministrativo
// ======================================================
log_event($admin["id"], "admin_add_user", "ID=$newId USER=$username");

// ======================================================
// Risposta OK
// ======================================================
echo json_encode([
    "ok" => true,
    "user_id" => $newId
]);
exit;
?>
