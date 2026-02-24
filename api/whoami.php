<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_middleware.php';
header('Content-Type: application/json; charset=utf-8');

$user = null;
try {
    $user = auth_user(); // restituisce payload utente o esce(401)
} catch (Exception $e) {
    http_response_code(401);
    echo json_encode(["ok"=>false,"error"=>"NOT_AUTH"]);
    exit;
}

echo json_encode(["ok"=>true,"user"=>$user]);
exit;
?>