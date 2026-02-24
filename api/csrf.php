<?php
declare(strict_types=1);

// 🔐 Avvia sessione se non attiva
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

// 🔐 Genera CSRF token se non esiste
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// 🔐 Set cookie CSRF (leggibile da JS)
setcookie(
    'csrf_token',
    $_SESSION['csrf_token'],
    [
        'expires'  => time() + 3600,
        'path'     => '/',
        'secure'   => false,        // true in HTTPS
        'httponly' => false,        // ❗ deve essere false (JS lo legge)
        'samesite' => 'Lax'
    ]
);

// Funzione per verificare il token CSRF
function csrf_header_matches(): bool {
    if ($_SERVER["REQUEST_METHOD"] === "GET") return true;
    // If a valid JWT is provided in Authorization header, allow (API clients)
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\\s+(.+)$/i', $authHeader, $m)) {
        // lazy-load TokenManager
        require_once __DIR__ . '/token.php';
        try {
            $payload = TokenManager::validateJwt($m[1], $GLOBALS['pdo']);
            if ($payload) return true;
        } catch (Throwable $e) {
            // ignore and fallthrough to cookie check
        }
    }
    return ($_SERVER["HTTP_X_CSRF_TOKEN"] ?? "") === ($_COOKIE["csrf_token"] ?? "");
}

// Funzione per richiedere CSRF
function auth_require_csrf(): void {
    if (!csrf_header_matches()) {
        http_response_code(403);
        echo json_encode(["error"=>"CSRF_MISMATCH"]);
        exit;
    }
}
?>