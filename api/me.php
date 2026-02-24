<?php
declare(strict_types=1);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/token.php";
require_once __DIR__ . "/startSecureSession.php";

/* ================= CORS ================= */
$allowedOrigins = [
    "http://localhost:4000",
    "http://localhost:8000"
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Vary: Origin");
}
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token");
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json; charset=utf-8");
startSecureSession();

function me_response_from_user(array $user): void {
    try {
        $upd = $GLOBALS['pdo']->prepare("UPDATE users SET last_activity = NOW() WHERE id = ?");
        $upd->execute([(int)$user["id"]]);
    } catch (Throwable $e) {
        error_log("me.php activity update failed: " . $e->getMessage());
    }
    echo json_encode([
        "id" => (int)$user["id"],
        "username" => (string)$user["username"],
        "role" => (string)$user["role"],
        "avatar" => $user["avatar"] ?? null
    ]);
    exit;
}

// 1) Sessione utente esistente (caso standard dopo login)
if (!empty($_SESSION['user_id'])) {
    $stmt = $GLOBALS['pdo']->prepare("SELECT id, username, role, avatar FROM users WHERE id = ? LIMIT 1");
    $stmt->execute([(int)$_SESSION['user_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($user) {
        me_response_from_user($user);
    }
}

// 2) Fallback JWT via Authorization: Bearer <token>
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
    try {
        $payload = TokenManager::validateJwt($m[1], $GLOBALS['pdo']);
        if (!empty($payload['user_id'])) {
            $stmt = $GLOBALS['pdo']->prepare("SELECT id, username, role, avatar FROM users WHERE id = ? LIMIT 1");
            $stmt->execute([(int)$payload['user_id']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user) {
                me_response_from_user($user);
            }
        }
    } catch (Throwable $e) {
        // token non valido -> continua e risponde 401
    }
}

http_response_code(401);
echo json_encode(["error" => "AUTH_REQUIRED"]);
exit;
?>
