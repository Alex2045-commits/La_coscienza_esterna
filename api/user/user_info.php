<?php
declare(strict_types=1);
require_once __DIR__ . "/../config.php";
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . "/../../security/security_logger.php";
require_once __DIR__ . "/../utils.php";

ini_set('display_errors', '0');
error_reporting(E_ALL);

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

function xpNeededForUserInfo(int $lvl): int {
    return 50 + ($lvl - 1) * 50;
}

function cumulativeXpBeforeLevelUserInfo(int $level): int {
    $lvl = max(1, $level);
    $sum = 0;
    for ($i = 1; $i < $lvl; $i++) {
        $sum += xpNeededForUserInfo($i);
    }
    return $sum;
}

function ensureTotalXpColumnUserInfo(PDO $pdo): void {
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
        error_log("ensureTotalXpColumnUserInfo failed: " . $e->getMessage());
    }
}

// Utente loggato
$user = auth_require_user();
$uid = (int)$user["id"];

/* ================= LOG ACCESS ================= */
security_log($pdo, $uid, 'user_info_access', [
    'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
]);

// Preleva info utente
$stmt = $pdo->prepare("SELECT id, username, email, role, avatar, banned_until 
                       FROM users WHERE id = :id LIMIT 1");
$stmt->execute([":id"=>$uid]);
$info = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$info) {
    echo json_encode(["error"=>"User not found"]);
    exit;
}

// Preleva progressi gioco
ensureTotalXpColumnUserInfo($pdo);

$stmt2 = $pdo->prepare("SELECT level, experience, total_experience, coins, inventory
                        FROM game_progress
                        WHERE user_id = :id LIMIT 1");
$stmt2->execute([":id"=>$uid]);
$progress = $stmt2->fetch(PDO::FETCH_ASSOC);

if (!$progress) {
    // SE NON ESISTE IL RECORD, lo creo qui SENZA DEFAULT NEL DB
    $pdo->prepare("INSERT INTO game_progress 
                   (user_id, level, experience, total_experience, coins, inventory) 
                   VALUES (:id, 1, 0, 0, 0, '{}')")
        ->execute([":id"=>$uid]);

    $progress = [
        "level" => 1,
        "experience" => 0,
        "total_experience" => 0,
        "coins" => 0,
        "inventory" => "{}"
    ];
}

// Decodifica inventario JSON
$progress["inventory"] = json_decode($progress["inventory"], true) ?? [];
$lvl = max(1, (int)($progress["level"] ?? 1));
$xp = max(0, (int)($progress["experience"] ?? 0));
$progress["total_experience"] = isset($progress["total_experience"])
    ? max(0, (int)$progress["total_experience"])
    : (cumulativeXpBeforeLevelUserInfo($lvl) + $xp);

// Aggiungi coins alla risposta user per coerenza
$info["coins"] = (int)$progress["coins"];

// Premium avatars gia sbloccati dall'utente
$unlockedAvatars = [];
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS avatar_unlocks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            avatar VARCHAR(100) NOT NULL,
            unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_user_avatar (user_id, avatar),
            KEY idx_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $stUnlocks = $pdo->prepare("
        SELECT avatar
        FROM avatar_unlocks
        WHERE user_id = :id
        ORDER BY unlocked_at ASC
    ");
    $stUnlocks->execute([":id" => $uid]);
    $unlockedAvatars = $stUnlocks->fetchAll(PDO::FETCH_COLUMN) ?: [];
} catch (Throwable $e) {
    error_log("user_info avatar_unlocks read failed: " . $e->getMessage());
    $unlockedAvatars = [];
}

// Log progress retrieval
log_event($uid, 'user_info_retrieved', "Level=" . $progress['level'] . ", XP=" . $progress['experience']);

echo json_encode([
    "ok" => true,
    "user" => $info,
    "progress" => $progress,
    "avatar_unlocks" => $unlockedAvatars
]);
exit;
