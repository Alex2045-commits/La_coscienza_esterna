<?php
declare(strict_types=1);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/token.php";
require_once __DIR__ . "/../vendor/autoload.php";

use OTPHP\TOTP;

header("Content-Type: application/json; charset=utf-8");

$data = json_decode(file_get_contents("php://input"), true);
$userId = (int)($data['user_id'] ?? 0);
$code   = trim($data['code'] ?? '');

if (!$userId || $code === '') {
    http_response_code(400);
    echo json_encode(["error"=>"BAD_REQUEST"]);
    exit;
}

$st = $pdo->prepare("
  SELECT id, username, role, avatar, twofa_secret
  FROM users
  WHERE id = ? AND deleted_at IS NULL
");
$st->execute([$userId]);
$user = $st->fetch();

if (!$user) {
    http_response_code(401);
    echo json_encode(["error"=>"INVALID_USER"]);
    exit;
}

if ($user['role'] === 'admin') {
    $totp = TOTP::create($user['twofa_secret']);

    if (!$totp->verify($code)) {
        http_response_code(401);
        echo json_encode(["error"=>"INVALID_TOTP"]);
        exit;
    }
}

// 🔐 LOGIN COMPLETATO
$jwt = TokenManager::generateJwt($user);
$refresh = TokenManager::createRefreshToken($user['id'], $pdo);

setcookie("access_token", $jwt, [
    "expires"  => time() + $GLOBALS["JWT_TTL"],
    "path"     => "/",
    "httponly" => true,
    "secure"   => $GLOBALS["COOKIE_SECURE"],
    "samesite" => $GLOBALS["COOKIE_SAMESITE"]
]);

setcookie("refresh_token", $refresh, [
    "expires"  => time() + $GLOBALS["REFRESH_TTL"],
    "path"     => "/",
    "httponly" => true,
    "secure"   => $GLOBALS["COOKIE_SECURE"],
    "samesite" => $GLOBALS["COOKIE_SAMESITE"]
]);

echo json_encode(["ok"=>true]);
exit;
?>