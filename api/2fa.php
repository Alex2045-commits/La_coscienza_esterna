<?php
declare(strict_types=1);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/../vendor/autoload.php";

use OTPHP\TOTP;

header("Content-Type: application/json; charset=utf-8");

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') 
          || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

// Avvia sessione solo se non è partita
if (session_status() === PHP_SESSION_NONE) {
    session_start([
        'cookie_lifetime' => 0,
        'cookie_secure' => $secure,
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax',
        'use_strict_mode' => true,
    ]);
}

// =================== CONFIG ===================
define('TFA_TIMEOUT', 240); // 5 minuti per completare 2FA

// =================== LOGGING ===================
function tfa_log(string $message): void {
    error_log("[2FA] " . $message);
}

// =================== CHECK 2FA REQUIRED ===================
function auth_is_2fa_required(): bool {
    return isset($_SESSION['2fa_user_id']);
}

// =================== VERIFY 2FA CODE ===================
function auth_verify_2fa_code(string $code): bool {
    if (!isset($_SESSION['2fa_user_id'], $_SESSION['2fa_started_at'])) {
        tfa_log("2FA sessione mancante.");
        return false;
    }

    // Controllo timeout
    if (time() - (int)$_SESSION['2fa_started_at'] > TFA_TIMEOUT) {
        tfa_log("2FA scaduta per user_id {$_SESSION['2fa_user_id']}");
        session_unset();
        session_destroy();
        return false;
    }

    $userId = $_SESSION['2fa_user_id'];
    global $pdo;

    $stmt = $pdo->prepare("SELECT twofa_secret, twofa_recovery_codes FROM users WHERE id = ? LIMIT 1");
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        tfa_log("Utente non trovato per 2FA: {$userId}");
        return false;
    }

    // =================== VERIFY TOTP ===================
    if (!empty($user['twofa_secret'])) {
        $totp = TOTP::create($user['twofa_secret']);
        if ($totp->verify($code)) {
            $_SESSION['user_id'] = $userId;
            unset($_SESSION['2fa_user_id'], $_SESSION['2fa_started_at']);
            tfa_log("2FA completata correttamente per user_id: {$userId}");
            return true;
        }
    }

    // =================== VERIFY RECOVERY CODES ===================
    if (!empty($user['twofa_recovery_codes'])) {
        $codes = json_decode($user['twofa_recovery_codes'], true) ?? [];
        if (in_array($code, $codes, true)) {
            $codes = array_values(array_diff($codes, [$code]));
            $upd = $pdo->prepare("UPDATE users SET twofa_recovery_codes = ? WHERE id = ?");
            $upd->execute([json_encode($codes), $userId]);

            $_SESSION['user_id'] = $userId;
            unset($_SESSION['2fa_user_id'], $_SESSION['2fa_started_at']);
            tfa_log("2FA completata con recovery code per user_id: {$userId}");
            return true;
        }
    }

    tfa_log("2FA fallita per user_id: {$userId}");
    return false;
}

// =================== HANDLER REQUEST ===================
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input) || empty($input['code'])) {
    http_response_code(400);
    echo json_encode(['error' => 'CODE_REQUIRED']);
    exit;
}

$code = trim($input['code']);
$success = auth_verify_2fa_code($code);

if ($success) {
    // Se vuoi, puoi generare JWT o refresh token qui
    echo json_encode(['ok' => true]);
    exit;
} else {
    http_response_code(401);
    echo json_encode(['error' => 'INVALID_2FA_CODE']);
    exit;
}
?>