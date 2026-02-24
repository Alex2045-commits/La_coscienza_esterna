<?php
declare(strict_types=1);
ini_set('display_errors', '1'); // Mostra errori temporaneamente per debug
error_reporting(E_ALL);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/token.php";
require_once __DIR__ . "/utils.php"; // resetSecurityScore deve esserci

header("Content-Type: application/json; charset=utf-8");

// CORS (anche per la richiesta POST reale, non solo preflight)
$allowedOrigins = [
    "http://localhost:4000",
    "http://localhost:8000"
];
$origin = $_SERVER["HTTP_ORIGIN"] ?? "";
if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Vary: Origin");
}
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token");
header("Access-Control-Allow-Methods: POST, OPTIONS");

// CORS preflight
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    exit;
}

// Avvia sessione se non esiste
if (session_status() === PHP_SESSION_NONE) session_start();

try {
    // Salva l'user_id prima di distruggere la sessione
    $userId = $_SESSION['user_id'] ?? null;

    // 1) Revoca refresh token se presente
    $refresh = $_COOKIE["refresh_token"] ?? "";
    if (!empty($refresh) && isset($pdo)) {
        $hash = hash("sha256", $refresh);
        $stmt = $pdo->prepare("UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = :h");
        $stmt->execute([":h" => $hash]);
    }

    // 2) Blacklist dell'access token
    $access = $_COOKIE["access_token"] ?? "";
    if (!empty($access) && isset($pdo)) {
        $payload = TokenManager::validateJwt($access, $pdo);
        if ($payload) {
            TokenManager::blacklistJwtByPayload($payload, $pdo);
        }
    }

    // 3) Aggiorna stato utente e reset IP score se utente esiste
    if ($userId !== null && isset($pdo)) {
        try {
            $stmt = $pdo->prepare("UPDATE users SET last_activity = NOW(), last_logout = NOW() WHERE id = ?");
            $stmt->execute([$userId]);
        } catch (Throwable $e) {
            // fallback se la colonna last_logout non esiste
            $stmt = $pdo->prepare("UPDATE users SET last_activity = NOW() WHERE id = ?");
            $stmt->execute([$userId]);
        }

        // reset score IP solo se la funzione esiste
        if (function_exists('resetSecurityScore')) {
            $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
            resetSecurityScore($ip);
        }
    }

    // 4) Cancella i cookie
    foreach (["access_token", "refresh_token", "csrf_token"] as $c) {
        setcookie($c, "", [
            "expires" => time() - 3600,
            "path" => "/",
            "domain" => "",
            "secure" => false,
            "httponly" => ($c !== "csrf_token"),
            "samesite" => "Lax"
        ]);
    }

    // 5) Distruggi la sessione
    $_SESSION = [];
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params["path"], '', false, $params["httponly"]);
    }
    session_destroy();

    echo json_encode([
        "ok" => true,
        "message" => "Logout successful"
    ]);
} catch (Throwable $e) {
    error_log("Logout ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "error" => "SERVER_ERROR",
        "detail" => $e->getMessage()
    ]);
}
