<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . "/config.php";

function containsOffensiveWord(string $username): bool
{
    // normalizza: minuscolo, rimuove separatori comuni
    $u = strtolower($username);
    $u = str_replace(['.', '_', '-', ' '], '', $u);

    // sostituzioni tipiche (leet speak)
    $u = strtr($u, [
        '0' => 'o',
        '1' => 'i',
        '3' => 'e',
        '4' => 'a',
        '5' => 's',
        '7' => 't',
        '@' => 'a',
        '!' => 'i'
    ]);

    $blacklist = [
        // bestemmie
        'dio',
        'porcodio',
        'madonnaputtana',
        'gesucristo',

        // parolacce
        'cazzo',
        'merda',
        'stronzo',
        'puttana',
        'troia',
        'vaffanculo',
        'culo',
        'minchia',

        // odio / insulti
        'nazista',
        'hitler',
        'terrorista'
    ];

    foreach ($blacklist as $bad) {
        if (str_contains($u, $bad)) {
            return true;
        }
    }

    return false;
}

function log_event($userId, $action, $details='') {
    global $pdo;
    $stmt = $pdo->prepare("
        INSERT INTO logs (user_id, action, details, ip, user_agent)
        VALUES (:uid,:action,:details,:ip,:ua)
    ");
    $stmt->execute([
        ':uid'=>$userId,
        ':action'=>$action,
        ':details'=>$details,
        ':ip'=>$_SERVER['REMOTE_ADDR'] ?? null,
        ':ua'=>$_SERVER['HTTP_USER_AGENT'] ?? null
    ]);
}

function isIpBanned(string $ip): bool {
    $devWhitelist = ['127.0.0.1', '::1'];

    if (in_array($ip, $devWhitelist, true)) {
        return false;
    }

    global $pdo;
    $stmt = $pdo->prepare("
        SELECT 1 FROM ip_bans
        WHERE ip = ?
        AND (banned_until IS NULL OR banned_until > NOW())
        LIMIT 1
    ");
    $stmt->execute([$ip]);
    return (bool)$stmt->fetchColumn();
}

function banIp(string $ip, string $reason, int $minutes = 60): void {
    global $pdo;
    $until = $minutes > 0
        ? date('Y-m-d H:i:s', time() + ($minutes * 60))
        : null;

    $pdo->prepare("
        INSERT INTO ip_bans (ip, reason, banned_until)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            reason = VALUES(reason),
            banned_until = VALUES(banned_until)
    ")->execute([$ip, $reason, $until]);

    log_security_event(0, 'ip_banned', ['ip'=>$ip, 'reason'=>$reason]);
}

function admin_log(
    int $adminId,
    string $action,
    ?int $targetUserId = null,
    ?string $details = null
) : void {
    global $pdo;
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $pdo->prepare("
        INSERT INTO admin_logs
        (admin_id, action, target_user_id, details, ip, created_at)
        VALUES (?,?,?,?,?,NOW())
    ")->execute([$adminId, $action, $targetUserId, $details, $ip]);

    log_event($adminId, "admin:$action", $details ?? '');
}
function log_security_event(int $userId, string $event, array $meta = []): void {
    global $pdo;
    $stmt = $pdo->prepare("
        INSERT INTO security_audit (user_id, event, ip, meta)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([
        $userId,
        $event,
        $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        json_encode($meta, JSON_UNESCAPED_UNICODE)
    ]);
}

function publicLoginError() {
    http_response_code(401);
    echo json_encode(['ok'=>false,'error'=>'INVALID_LOGIN']);
    exit;
}

function resetSecurityScore(string $ip): void {
    global $pdo;
    $pdo->prepare("
        UPDATE security_ip_score
        SET score = 0, last_event_at = NOW()
        WHERE ip = ?
    ")->execute([$ip]);
}

function handleSecurityScore(string $ip, int $points, string $reason, ?int $targetUserId = null): int {
    global $pdo;

    // non aggiungere punti se admin
    if (!empty($_SESSION['role']) && $_SESSION['role'] === 'admin') {
        return 0;
    }

    if ($points === 0) {
        resetSecurityScore($ip);
        return 0;
    }

    $pdo->prepare("
        INSERT INTO security_ip_score (ip, score, last_event_at)
        VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE
            score = score + VALUES(score),
            last_event_at = NOW()
    ")->execute([$ip, $points]);

    return (int)$pdo->query("SELECT score FROM security_ip_score WHERE ip = ".$pdo->quote($ip))->fetchColumn();
}

function checkSqlInjection(string $input, bool $isPassword = false): int {
    $score = detectSqlInjection($input, $isPassword);
    if ($score > 0) {
        log_security_event(0, 'sql_injection_detected', [
            'input_hash' => hash('sha256', $input),
            'score' => $score
        ]);
    }
    return $score;
}

function checkBruteForce(string $ip, string $identifier, int $increment = 1, int $limit = 5): int {
    $bfKey = 'bf_' . sha1($ip . '|' . strtolower($identifier));
    $attempts = $_SESSION[$bfKey] ?? 0;
    $attempts += $increment;
    $_SESSION[$bfKey] = $attempts;

    // Aumenta il security score per il tentativo
    handleSecurityScore($ip, 5, 'brute force attempt');

    return $attempts;
}

function processLoginAttempt(string $identifier, string $password, string $ip, string $userAgent): array {
    global $pdo;

    // 1. Controlla SQL injection
    $sqlScore = checkSqlInjection($identifier) + checkSqlInjection($password, true);
    if ($sqlScore >= 30) {
        handleSecurityScore($ip, 20, 'sql injection detected');
        return ['ok'=>false, 'error'=>'INVALID_LOGIN'];
    }

    // 2. Cerca l'utente
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username=? OR email=? LIMIT 1");
    $stmt->execute([$identifier, $identifier]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // 3. Utente non trovato → brute force
    if (!$user) {
        $attempts = checkBruteForce($ip, $identifier);
        auto_ban_if_needed($ip, getIpScore($ip));
        return ['ok'=>false, 'error'=>'INVALID_LOGIN', 'attempts'=>$attempts];
    }

    // 4. Password errata
    $pepper = $GLOBALS['PASSWORD_PEPPER'] ?? '';
    if (!password_verify($password.$pepper, $user['password_hash'])) {
        $attempts = checkBruteForce($ip, $identifier);
        auto_ban_if_needed($ip, getIpScore($ip));
        return ['ok'=>false, 'error'=>'INVALID_LOGIN', 'attempts'=>$attempts];
    }

    // 5. Login OK → reset brute force
    $bfKey = 'bf_' . sha1($ip . '|' . strtolower($identifier));
    unset($_SESSION[$bfKey]);

    return ['ok'=>true, 'user'=>$user];
}

function auto_ban_if_needed(string $ip, int $score): void {
    if (($_ENV['APP_ENV'] ?? 'prod') === 'dev') return; // no ban in dev

    if ($score >= 50) {
        banIp($ip, 'bot detected', 60*24*7);
    } elseif ($score >= 30) {
        banIp($ip, 'suspicious activity', 24*60);
    }
}

function addSecurityScore(string $ip, int $points): int
{
    global $pdo;

    $pdo->prepare("
        INSERT INTO security_scores (ip, score, last_seen)
        VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE
            score = score + VALUES(score),
            last_seen = NOW()
    ")->execute([$ip, $points]);

    return (int)$pdo->query("
        SELECT score FROM security_scores WHERE ip = ".$pdo->quote($ip)
    )->fetchColumn();
}

function score_ip(string $ip, int $points): int {
    global $pdo;

    $pdo->prepare("
        INSERT INTO security_ip_score (ip, score, last_event_at)
        VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE
            score = score + VALUES(score),
            last_event_at = NOW()
    ")->execute([$ip, $points]);

    return (int)$pdo->query("SELECT score FROM security_ip_score WHERE ip = ".$pdo->quote($ip))->fetchColumn();
}

function detectSqlInjection(string $input, bool $isPassword = false): int {
    $score = 0;

    // usa RAW input per pattern critici
    $raw = strtolower($input);

    // BLOCCO IMMEDIATO: quote + comment
    if (preg_match("/'\s*(--|#)/", $raw)) {
        return 30;
    }

    // poi normalizza per pattern avanzati
    $s = normalizeInput($input);

    // ricompone keyword SQL offuscate
    $s = preg_replace_callback(
        '/\b(u\s*n\s*i\s*o\s*n|s\s*e\s*l\s*e\s*c\s*t|i\s*n\s*s\s*e\s*r\s*t|d\s*r\s*o\s*p)\b/',
        function ($m) {
            return str_replace(' ', '', $m[0]);
        },
        $s
    );

    $len = strlen($s);
    $symbols = preg_match_all('/[^\w\s@.\-]/', $s);

    if ($len > 12 && ($symbols / $len) > 0.35) {
        $score += 10;
    }

    $highRisk = [
        '/\bunion\s+select\b/',
        '/\bor\s+1\s*=\s*1\b/',
        '/\b1\s*=\s*1\b/',
        "/'\s*(--|#)/",
        '/\bsleep\s*\(/',
        '/\bbenchmark\s*\(/',
        '/\bwaitfor\s+delay\b/',
        '/\bload_file\s*\(/',
        '/\binformation_schema\b/',
    ];

    $mediumRisk = [
        '/\bselect\b.+\bfrom\b/',
        '/\binsert\b.+\binto\b/',
        '/\bupdate\b.+\bset\b/',
        '/\bdelete\b.+\bfrom\b/',
        '/\bdrop\s+table\b/',
    ];

    $syntax = [
        "/'/", '/"/', '/;/'
    ];

    foreach ($highRisk as $p) {
        if (preg_match($p, $s)) $score += 30;
    }

    foreach ($mediumRisk as $p) {
        if (preg_match($p, $s)) $score += 10;
    }

    foreach ($syntax as $p) {
        if (preg_match($p, $s)) {
            $score += $isPassword ? 0 : 2;
        }
    }

    return $score;
}

function normalizeInput(string $input): string {
    $input = rawurldecode($input);
    $input = html_entity_decode($input, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    // rimuove commenti SQL
    $input = preg_replace('/\/\*.*?\*\//s', '', $input);
    $input = preg_replace('/(--|#).*$/m', '', $input);
    $input = preg_replace('/(\s|\'|")(--|#).*/', '', $input);

    // collassa spazi
    $input = preg_replace('/\s+/', ' ', $input);

    return strtolower(trim($input));
}

function require_csrf() : void {
    $header = $_SERVER["HTTP_X_CSRF_TOKEN"] ?? "";
    $cookie = $_COOKIE["csrf_token"] ?? "";
    if ($header === "" || $header !== $cookie) {
        http_response_code(403);
        echo json_encode(["error"=>"CSRF_MISMATCH"]);
        exit;
    }
}

function audit_log(int $userId, string $event, array $meta = []): void
{
    global $pdo;

    $pdo->prepare("
        INSERT INTO security_audit (user_id, event, ip, meta)
        VALUES (?, ?, ?, ?)
    ")->execute([
        $userId,
        $event, // corretto da 'action' a 'event'
        $_SERVER['REMOTE_ADDR'] ?? null,
        json_encode($meta, JSON_UNESCAPED_UNICODE)
    ]);
}

function getIpScore(string $ip): int {
    global $pdo;
    return (int)$pdo->query("SELECT score FROM security_ip_score WHERE ip=".$pdo->quote($ip))->fetchColumn();
}

function isBot(string $ip, int $threshold = 50): bool {
    return getIpScore($ip) >= $threshold;
}

/**
 * Funzione unificata per loggare qualsiasi tipo di evento
 *
 * @param string $type        Tipo di log: 'general', 'admin', 'security'
 * @param int $userId         ID dell'utente o admin che compie l'azione
 * @param string $action      Azione/evento
 * @param string|null $details Dettagli testuali opzionali
 * @param array $meta         Dati extra opzionali per log di sicurezza
 * @param int|null $targetUserId ID utente target (solo per admin)
 */

function addLog(
    string $type,
    int $userId,
    string $action,
    ?string $details = null,
    array $meta = [],
    ?int $targetUserId = null
): void {
    global $pdo;

    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';

    switch ($type) {
        case 'general':
            $stmt = $pdo->prepare("
                INSERT INTO logs (user_id, action, details, ip, user_agent)
                VALUES (:uid, :action, :details, :ip, :ua)
            ");
            $stmt->execute([
                ':uid'     => $userId,
                ':action'  => $action,
                ':details' => $details ?? '',
                ':ip'      => $ip,
                ':ua'      => $ua
            ]);
            break;

        case 'admin':
            $stmt = $pdo->prepare("
                INSERT INTO admin_logs (admin_id, action, target_user_id, details, ip, created_at)
                VALUES (?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([$userId, $action, $targetUserId, $details, $ip]);

            log_event($userId, "admin:$action", $details ?? '');
            break;

        case 'security':
            $stmt = $pdo->prepare("
                INSERT INTO security_audit (user_id, event, ip, meta)
                VALUES (?, ?, ?, ?)
            ");
            $stmt->execute([
                $userId,
                $action, // qui diventa event
                $ip,
                json_encode($meta, JSON_UNESCAPED_UNICODE)
            ]);
            break;

        default:
            throw new InvalidArgumentException("Tipo di log non valido: $type");
    }
}

function add_notification(int $userId, string $message): void {
    global $pdo;
    if ($userId <= 0 || trim($message) === '') return;

    $stmt = $pdo->prepare("
        INSERT INTO notifications (user_id, message, read_flag, created_at)
        VALUES (:uid, :msg, 0, NOW())
    ");
    $stmt->execute([
        ':uid' => $userId,
        ':msg' => $message
    ]);
}

?>
