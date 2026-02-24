<?php
declare(strict_types=1);

require_once __DIR__ . '/startSecureSession.php';

function security_collect_request_values(): array {
    $values = [];

    $walker = static function ($v) use (&$values, &$walker): void {
        if (is_array($v)) {
            foreach ($v as $x) $walker($x);
            return;
        }
        if (is_object($v)) {
            foreach ((array)$v as $x) $walker($x);
            return;
        }
        if (is_string($v) || is_numeric($v)) {
            $values[] = (string)$v;
        }
    };

    $walker($_GET ?? []);
    $walker($_POST ?? []);

    $raw = $GLOBALS['__RAW_INPUT_CACHE'] ?? null;
    if ($raw === null) {
        $raw = (string)file_get_contents('php://input');
        $GLOBALS['__RAW_INPUT_CACHE'] = $raw;
    }
    if ($raw !== '') {
        $json = json_decode($raw, true);
        if (is_array($json)) {
            $walker($json);
        } else {
            $values[] = $raw;
        }
    }

    return $values;
}

function security_match_event(string $input): ?string {
    $v = strtolower(trim($input));
    if ($v === '') return null;

    $sqlPatterns = [
        '/\bunion\s+select\b/i',
        '/\bselect\b.+\bfrom\b/i',
        '/\binsert\s+into\b/i',
        '/\bupdate\s+\w+\s+set\b/i',
        '/\bdelete\s+from\b/i',
        '/\bdrop\s+table\b/i',
        '/\bor\s+1\s*=\s*1\b/i',
        '/\band\s+1\s*=\s*1\b/i',
        "/'\s*(or|and)\s+'?1'?\s*=\s*'?1/i",
        '/--/',
        '/\/\*.*\*\//is',
        '/\bsleep\s*\(/i',
        '/\bbenchmark\s*\(/i',
        '/\binformation_schema\b/i',
    ];
    foreach ($sqlPatterns as $p) {
        if (preg_match($p, $v)) return 'sql_injection';
    }

    $xssPatterns = [
        '/<\s*script\b/i',
        '/<\/\s*script\s*>/i',
        '/onerror\s*=/i',
        '/onload\s*=/i',
        '/javascript\s*:/i',
        '/document\.cookie/i',
        '/<\s*img\b[^>]*>/i',
        '/<\s*svg\b[^>]*>/i',
        '/<\s*iframe\b/i',
    ];
    foreach ($xssPatterns as $p) {
        if (preg_match($p, $v)) return 'xss_attempt';
    }

    $lfiPatterns = [
        '/\.\.\//',
        '/\.\.\\\\/',
        '/\/etc\/passwd/i',
        '/\/proc\/self\/environ/i',
        '/php:\/\/(input|filter|stdin)/i',
        '/file:\/\//i',
        '/\.\.%2f/i',
        '/%2e%2e%2f/i',
    ];
    foreach ($lfiPatterns as $p) {
        if (preg_match($p, $v)) return 'lfi_attempt';
    }

    $rcePatterns = [
        '/\$\(.+\)/',
        '/`[^`]+`/',
        '/(?:;|\|\||&&)\s*(?:bash|sh|zsh|cmd|powershell|pwsh|curl|wget|nc|netcat|python|php)\b/i',
        '/\b(?:cmd\.exe|powershell\.exe|\/bin\/sh|\/bin\/bash)\b/i',
    ];
    foreach ($rcePatterns as $p) {
        if (preg_match($p, $v)) return 'rce_attempt';
    }

    return null;
}

function security_guard_block_payload_attacks(PDO $pdo): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') return;

    $values = security_collect_request_values();
    if (!$values) return;

    $matched = null;
    $event = null;
    foreach ($values as $val) {
        $ev = security_match_event($val);
        if ($ev !== null) {
            $matched = $val;
            $event = $ev;
            break;
        }
    }
    if ($matched === null || $event === null) return;

    startSecureSession();
    $uid = (int)($_SESSION['user_id'] ?? $_SESSION['admin_id'] ?? 0);
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';

    security_log($pdo, $uid > 0 ? $uid : null, $event, [
        'source' => $_SERVER['REQUEST_URI'] ?? '',
        'method' => $_SERVER['REQUEST_METHOD'] ?? 'GET',
        'payload_hash' => hash('sha256', $matched),
        'sample' => mb_substr($matched, 0, 120),
        'ip' => $ip,
        'ua' => $ua
    ]);

    if (function_exists('handleSecurityScore')) {
        $score = match ($event) {
            'sql_injection' => 15,
            'xss_attempt' => 12,
            'lfi_attempt' => 12,
            'rce_attempt' => 18,
            default => 10
        };
        try {
            handleSecurityScore($ip, $score, $event . ' payload');
        } catch (Throwable $e) {
            // ignore score errors
        }
    }

    http_response_code(403);
    echo json_encode(['error' => strtoupper($event) . '_DETECTED']);
    exit;
}

// backward compatibility
function security_guard_block_sqli(PDO $pdo): void {
    security_guard_block_payload_attacks($pdo);
}

