<?php
// ===========================================
// check_2fa_session.php
// Verifica se la sessione 2FA è attiva
// ===========================================

declare(strict_types=1);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/sessions.php";
require_once __DIR__ . "/startSecureSession.php";
require_once __DIR__ . '/../security/security_logger.php';
require_once __DIR__ . '/token.php'; // TokenManager

// Permetti CORS solo per il frontend
$allowed_origins = [
    "http://localhost:4000", // front-end dev
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

// Gestione preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Avvia sessione PHP sicura
startSecureSession();

// Risposta di default
$response = [
    'ok' => false,
    'twofa_required' => true,
    'role' => null,
    'user_id' => null,
    'error' => null
];

// =================== CONTROLLA SESSIONE ===================
if (isset($_SESSION['2fa_user_id'])) {
    $response['ok'] = true;
    $response['twofa_required'] = true;
    $response['user_id'] = $_SESSION['2fa_user_id'];

    // Token temporaneo per sessione 2FA
    $tempPayload = [
        'user_id' => $_SESSION['2fa_user_id'],
        'twofa' => true,
        'exp' => $_SESSION['2fa_started_at'] + 300
    ];
    $response['temp_token'] = TokenManager::generateJwt($tempPayload);
} else {
    // Sessione invalida
    $logUserId = $_SESSION['2fa_user_id'] ?? null;
    $logRole = $_SESSION['role'] ?? 'unknown';

    security_log($pdo, $logUserId, '2fa_required', [
        'role' => $logRole,
        'note' => 'Login admin con 2FA richiesto'
    ]);

    $response['ok'] = false;
    $response['twofa_required'] = true;
    $response['error'] = 'SESSION_INVALID';
}

if (isset($_SESSION['email_otp_verified']) || isset($_SESSION['admin_2fa_hash'])) {
    $response['ok'] = true;
    $response['email_otp_required'] = isset($_SESSION['admin_2fa_hash']);
    $response['user_id'] = $_SESSION['email_otp_verified'] ?? null;
}

// =================== GENERA JWT SE UTENTE LOGGATO ===================
if (!empty($_SESSION['user_id']) && !empty($_SESSION['2fa_verified'])) {
    $tokenPayload = [
        'id' => $_SESSION['user_id'],
        'role' => $_SESSION['role'],
        'exp' => time() + ($GLOBALS['JWT_TTL'] ?? 900) // TTL fallback 15 min
    ];

    $jwt = TokenManager::generateJwt($tokenPayload);

    // Aggiunge JWT alla risposta
    $response['jwt'] = $jwt;
}

// =================== INVIA JSON ===================
header("Content-Type: application/json");
echo json_encode($response);
exit();