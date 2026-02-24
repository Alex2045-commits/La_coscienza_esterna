<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/user/auth_middleware.php';
require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/utils.php';
require_once __DIR__ . '/../security/security_logger.php';

header('Content-Type: application/json; charset=utf-8');

auth_require_csrf();
$user = auth_require_user();
$uid = (int)$user['id'];

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(["error" => "INVALID_JSON"]);
    exit;
}

$inventory = $data["inventory"] ?? [];
if (!is_array($inventory)) {
    http_response_code(400);
    echo json_encode(["error" => "INVALID_INVENTORY"]);
    exit;
}

if (count($inventory) > 100) {
    security_log($pdo, $uid, 'inventory_payload_oversize', [
        'count' => count($inventory),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
    ]);
    http_response_code(413);
    echo json_encode(["error" => "INVENTORY_TOO_LARGE"]);
    exit;
}

$cleanInventory = [];
foreach ($inventory as $k => $v) {
    $name = trim((string)$k);
    if ($name === '' || !preg_match('/^[a-zA-Z0-9 _.-]{1,40}$/', $name)) {
        continue;
    }
    $qty = (int)$v;
    if ($qty <= 0) continue;
    if ($qty > 999) $qty = 999;
    $cleanInventory[$name] = $qty;
}

$st = $pdo->prepare("SELECT level, experience, coins FROM game_progress WHERE user_id = :uid LIMIT 1");
$st->execute([":uid" => $uid]);
$current = $st->fetch(PDO::FETCH_ASSOC);

if (!$current) {
    $pdo->prepare("
        INSERT INTO game_progress (user_id, level, experience, coins, inventory)
        VALUES (:uid, 1, 0, 0, '[]')
    ")->execute([":uid" => $uid]);

    $current = [
        "level" => 1,
        "experience" => 0,
        "coins" => 0
    ];
}

if (array_key_exists("level", $data) || array_key_exists("experience", $data) || array_key_exists("coins", $data)) {
    security_log($pdo, $uid, 'manual_progress_fields_ignored', [
        'provided_level' => $data['level'] ?? null,
        'provided_experience' => $data['experience'] ?? null,
        'provided_coins' => $data['coins'] ?? null,
        'db_level' => (int)$current['level'],
        'db_experience' => (int)$current['experience'],
        'db_coins' => (int)$current['coins'],
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
    ]);
}

$upd = $pdo->prepare("
    UPDATE game_progress
    SET inventory = :inv, updated_at = NOW()
    WHERE user_id = :uid
");
$upd->execute([
    ":inv" => json_encode($cleanInventory),
    ":uid" => $uid
]);

log_event($uid, "save_progress_inventory", "Inventory updated");

echo json_encode([
    "ok" => true,
    "level" => (int)$current['level'],
    "experience" => (int)$current['experience'],
    "coins" => (int)$current['coins']
]);
exit;
?>
