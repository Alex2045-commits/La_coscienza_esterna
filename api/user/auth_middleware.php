<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . "/../config.php";
require_once __DIR__ . "/../token.php";
require_once __DIR__ . "/../startSecureSession.php";
require_once __DIR__ . "/../utils.php";
require_once __DIR__ . "/../security_request_guard.php";
require_once __DIR__ . "/../../security/security_logger.php";

/* ================= HEADERS ================= */
header('Content-Type: application/json; charset=utf-8');

/* ================= CORS ================= */
$allowedOrigin = 'http://localhost:4000';
if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] === $allowedOrigin) {
    header("Access-Control-Allow-Origin: $allowedOrigin");
}
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

security_guard_block_sqli($pdo);

/* ================= BLOCCO IP ================= */
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$check = $pdo->prepare("SELECT 1 FROM banned_ips WHERE ip = ? AND banned_until > NOW() LIMIT 1");
$check->execute([$ip]);
if ($check->fetchColumn()) {
    http_response_code(403);
    echo json_encode(['error' => 'IP_BANNED']);
    exit;
}

/* ================= SESSIONE UTENTE ================= */
function startUserSession(): void {
    startSecureSession();
}

/* ================= UTENTE NORMALE ================= */
function auth_user(): ?array {
    global $pdo;

    startUserSession();

    // DEV: auto-login a local test user when enabled
    if (defined('DEV_AUTO_LOGIN') && DEV_AUTO_LOGIN && empty($_SESSION['user_id']) && isLocalhost()) {
        try {
            $r = $pdo->query("SELECT id FROM users LIMIT 1");
            $first = $r ? $r->fetch(PDO::FETCH_ASSOC) : null;
            if ($first && !empty($first['id'])) {
                $_SESSION['user_id'] = (int)$first['id'];
            }
        } catch (Throwable $e) {
            // ignore DB errors for dev auto-login
        }
    }

    // Sessione normale
    if (!empty($_SESSION['user_id'])) {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([(int)$_SESSION['user_id']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            if (!empty($user['banned_until']) && strtotime($user['banned_until']) > time()) {
                http_response_code(403);
                echo json_encode([
                    'error' => 'USER_BANNED',
                    'banned_until' => $user['banned_until']
                ]);
                exit;
            }
            $authUser = [
                'id' => (int)$user['id'],
                'username' => $user['username'],
                'role' => $user['role'],
                'avatar' => $user['avatar'] ?? null
            ];
            $GLOBALS['AUTH_USER'] = $authUser;
            return $authUser;
        }
    }

    // JWT support
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
        try {
            $decoded = TokenManager::validateJwt($m[1], $pdo);
            if (!empty($decoded['user_id'])) {
                $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? LIMIT 1");
                $stmt->execute([(int)$decoded['user_id']]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($user) {
                    if (!empty($user['banned_until']) && strtotime($user['banned_until']) > time()) {
                        http_response_code(403);
                        echo json_encode([
                            'error' => 'USER_BANNED',
                            'banned_until' => $user['banned_until']
                        ]);
                        exit;
                    }
                    $authUser = [
                        'id' => (int)$user['id'],
                        'username' => $user['username'],
                        'role' => $user['role'],
                        'avatar' => $user['avatar'] ?? null
                    ];
                    $GLOBALS['AUTH_USER'] = $authUser;
                    return $authUser;
                }
            }
        } catch (Throwable $e) {
            // JWT non valido → ignora
        }
    }

    return null;
}

function auth_require_user(): array {
    $user = auth_user();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'AUTH_REQUIRED']);
        exit;
    }
    return $user;
}
