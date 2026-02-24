<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

class TokenManager {

    /* ============================================================
       BASE64 URL-SAFE
    ============================================================ */
    private static function b64(string $d): string {
        return rtrim(strtr(base64_encode($d), '+/', '-_'), '=');
    }

    private static function b64dec(string $d): string {
        $pad = strlen($d) % 4;
        if ($pad) $d .= str_repeat('=', 4 - $pad);
        return base64_decode(strtr($d, '-_', '+/'));
    }

    /* ============================================================
       GENERAZIONE JWT
    ============================================================ */
    public static function generateJwt(array $claims, ?int $ttl = null, ?string $secret = null): string {
    // Usa secret globale se non passato
    $secret = $secret ?? ($GLOBALS['JWT_SECRET_NEW'] ?? $GLOBALS['JWT_SECRET']);
    
    // Usa TTL passato oppure quello globale
    $ttl = $ttl ?? (int)($GLOBALS['JWT_TTL'] ?? 900); // default 15 min

    $iat = time();          // issued at
    $exp = $iat + $ttl;     // expiration
    $jti = bin2hex(random_bytes(16)); // unique token id

    // Merge claims con dati standard JWT
    $payload = array_merge($claims, [
        "iat" => $iat,
        "exp" => $exp,
        "jti" => $jti
    ]);

    $header = ["alg" => "HS256", "typ" => "JWT"];

    // Encoding base64 url-safe
    $h = self::b64(json_encode($header));
    $p = self::b64(json_encode($payload));
    $s = self::b64(hash_hmac("sha256", "$h.$p", $secret, true));

    return "$h.$p.$s";
}

    /* ============================================================
       VALIDAZIONE JWT con rotation
    ============================================================ */
    public static function validateJwt(string $jwt, PDO $pdo) {
        $secrets = [
            $GLOBALS["JWT_SECRET_NEW"] ?? '',
            $GLOBALS["JWT_SECRET"] ?? ''
        ];

        $parts = explode(".", $jwt);
        if (count($parts) !== 3) return false;
        [$h, $p, $s] = $parts;
        $valid = false;

        foreach ($secrets as $secret) {
            if (!$secret) continue;
            $expected = self::b64(hash_hmac("sha256", "$h.$p", $secret, true));
            if (hash_equals($expected, $s)) {
                $valid = true;
                break;
            }
        }

        if (!$valid) return false;

        $payload = json_decode(self::b64dec($p), true);
        if (!is_array($payload)) return false;
        if (!isset($payload["exp"]) || $payload["exp"] < time()) return false;

        // blacklist
        if (!empty($payload["jti"])) {
            $st = $pdo->prepare("SELECT 1 FROM jwt_blacklist WHERE jti = :j LIMIT 1");
            $st->execute([":j" => $payload["jti"]]);
            if ($st->fetchColumn()) return false;
        }

        return $payload;
    }

 // =================== REFRESH TOKEN ===================
    public static function createRefreshToken(int $userId, PDO $pdo): string {
        $plain = bin2hex(random_bytes(32));
        $hash = hash("sha256", $plain);
        $exp = date("Y-m-d H:i:s", time() + (int)$GLOBALS["REFRESH_TTL"]);

        $st = $pdo->prepare("INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked) VALUES (:u,:h,:e,0)");
        $st->execute([":u"=>$userId, ":h"=>$hash, ":e"=>$exp]);
        return $plain;
    }

    public static function verifyRefreshToken(string $plain, PDO $pdo) {
        $hash = hash("sha256", $plain);
        $st = $pdo->prepare("SELECT * FROM refresh_tokens WHERE token_hash=:h LIMIT 1");
        $st->execute([":h"=>$hash]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (!$row || $row["revoked"] || strtotime($row["expires_at"]) < time()) return false;
        return $row;
    }

    public static function revokeAllRefreshForUser(int $uid, PDO $pdo): void {
        $pdo->prepare("UPDATE refresh_tokens SET revoked=1 WHERE user_id=:u")->execute([":u"=>$uid]);
    }

    public static function blacklistJwtByPayload(array $payload, PDO $pdo): void {
        if (!isset($payload["jti"],$payload["exp"])) return;
        $st = $pdo->prepare("INSERT IGNORE INTO jwt_blacklist (jti, expires_at) VALUES (:j, FROM_UNIXTIME(:e))");
        $st->execute([":j"=>$payload["jti"], ":e"=>(int)$payload["exp"]]);
    }

    // =================== 2FA TEMP TOKEN ===================
    public static function generateTwoFAToken(int $userId): string {
        $payload = ['user_id'=>$userId,'iat'=>time(),'exp'=>time()+300]; // 5 min
        return self::generateJwt($payload);
    }

    public static function verifyTwoFAToken(string $token): ?array {
        return self::validateJwt($token, $GLOBALS['pdo']);
    }
}