<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/token.php";

header("Content-Type: application/json; charset=utf-8");

$csrf_header = $_SERVER["HTTP_X_CSRF_TOKEN"] ?? "";
$csrf_cookie = $_COOKIE["csrf_token"] ?? "";

if ($csrf_header !== $csrf_cookie) {
    http_response_code(403);
    echo json_encode(["error" => "CSRF_MISMATCH"]);
    exit;
}

$refresh = $_COOKIE["refresh_token"] ?? "";

$row = TokenManager::verifyRefreshToken($refresh, $GLOBALS['pdo']);
if (!$row) {
    http_response_code(401);
    echo json_encode(["error" => "REFRESH_INVALID"]);
    exit;
}

$stmt = $pdo->prepare("SELECT id, username, role FROM users WHERE id = :id");
$stmt->execute([":id" => $row["user_id"]]);
$user = $stmt->fetch();

$jwt = TokenManager::generateJwt($user);

setcookie("access_token", $jwt, [
    "expires" => time() + $GLOBALS["JWT_TTL"],
    "path" => "/",
    "httponly" => true,
    "secure" => $GLOBALS["COOKIE_SECURE"],
    "samesite" => $GLOBALS["COOKIE_SAMESITE"]
]);

echo json_encode(["ok" => true]);
?>
