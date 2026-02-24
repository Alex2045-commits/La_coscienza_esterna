<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/../../security/security_logger.php';

/* ================= HEADERS ================= */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

/* ================= AUTENTICAZIONE ================= */
$user = auth_require_user(); // solo utenti normali
$uid  = (int)$user['id'];

/* ================= LOG ACCESS ================= */
security_log($pdo, $uid, 'user_get_progress', [
    'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
]);

function xpNeededForUserProgress(int $lvl): int {
    return 50 + ($lvl - 1) * 50;
}

function cumulativeXpBeforeLevelUserProgress(int $level): int {
    $lvl = max(1, $level);
    $sum = 0;
    for ($i = 1; $i < $lvl; $i++) {
        $sum += xpNeededForUserProgress($i);
    }
    return $sum;
}

function ensureTotalXpColumnUserProgress(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $st = $pdo->query("SHOW COLUMNS FROM game_progress LIKE 'total_experience'");
        $exists = (bool)$st->fetch(PDO::FETCH_ASSOC);
        if (!$exists) {
            $pdo->exec("ALTER TABLE game_progress ADD COLUMN total_experience INT NOT NULL DEFAULT 0 AFTER experience");
        }
    } catch (Throwable $e) {
        error_log('ensureTotalXpColumnUserProgress failed: ' . $e->getMessage());
    }
}

/* ================= RECUPERA PROGRESS ================= */
ensureTotalXpColumnUserProgress($pdo);

$stmt = $pdo->prepare("
    SELECT level, experience, total_experience, coins, inventory 
    FROM game_progress 
    WHERE user_id = :id
    LIMIT 1
");
$stmt->execute([":id" => $uid]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

/* ================= CREA PROGRESS SE NON ESISTE ================= */
if (!$row) {
    $pdo->prepare("
        INSERT INTO game_progress (user_id, level, experience, total_experience, coins, inventory)
        VALUES (:id, 1, 0, 0, 0, '[]')
    ")->execute([":id" => $uid]);

    $row = [
        "level"      => 1,
        "experience" => 0,
        "total_experience" => 0,
        "coins"      => 0,
        "inventory"  => []
    ];
} else {
    $row["inventory"] = json_decode($row["inventory"], true) ?: [];
    $lvl = max(1, (int)($row["level"] ?? 1));
    $xp = max(0, (int)($row["experience"] ?? 0));
    $row["total_experience"] = isset($row["total_experience"])
        ? max(0, (int)$row["total_experience"])
        : (cumulativeXpBeforeLevelUserProgress($lvl) + $xp);
}

/* ================= RISPOSTA ================= */
echo json_encode([
    "user" => [
        "id" => $user["id"],
        "username" => $user["username"],
        "role" => $user["role"]
    ],
    "progress" => $row,
    "_endpoint_access" => "user,admin"
]);
