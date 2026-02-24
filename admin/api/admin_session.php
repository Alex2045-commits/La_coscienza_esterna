<?php
declare(strict_types=1);
require_once __DIR__ . "/../../api/startSecureSession.php";
require_once __DIR__ . "/../../api/utils.php";

$allowed_origins = [
    "http://localhost:4000", // front-end dev
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
}
header("Content-Type: application/json");

startSecureSession();

if (!isset($_SESSION['user_id']) || ($_SESSION['role'] ?? '') !== 'admin') {
    http_response_code(401);
    echo json_encode(['error' => 'AUTH_REQUIRED']);
    exit;
}

// Se non esiste CSRF token, generalo
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Ritorna dati admin e CSRF token
echo json_encode([
    'ok' => true,
    'user_id' => $_SESSION['user_id'],
    'username' => $_SESSION['username'],
    'role' => $_SESSION['role'],
    'csrf_token' => $_SESSION['csrf_token']
]);
exit;