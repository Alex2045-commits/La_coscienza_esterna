<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/user/auth_middleware.php';
require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/utils.php';

header('Content-Type: application/json; charset=utf-8');

auth_require_csrf();
$user = auth_require_user();
$uid = (int)$user['id'];

const PREMIUM_AVATAR_REQUIREMENTS = [
    'avatar26.png' => ['xp' => 220, 'coins' => 120],
    'avatar27.png' => ['xp' => 300, 'coins' => 180],
    'avatar28.png' => ['xp' => 420, 'coins' => 260],
    'avatar29.png' => ['xp' => 580, 'coins' => 360],
    'avatar30.png' => ['xp' => 760, 'coins' => 500],
];

function xpNeededForAvatar(int $lvl): int {
    return 50 + ($lvl - 1) * 50;
}

function cumulativeXpBeforeLevelAvatar(int $level): int {
    $lvl = max(1, $level);
    $sum = 0;
    for ($i = 1; $i < $lvl; $i++) {
        $sum += xpNeededForAvatar($i);
    }
    return $sum;
}

function ensureTotalXpColumnAvatar(PDO $pdo): void {
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
        error_log('ensureTotalXpColumnAvatar failed: ' . $e->getMessage());
    }
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
$avatar = trim($data['avatar'] ?? '');

if ($avatar === '') { echo json_encode(['error'=>'NO_AVATAR']); exit; }
if (!preg_match('/^[a-z0-9_\-\.]+$/i', $avatar)) { echo json_encode(['error'=>'INVALID_NAME']); exit; }

// avatars are served by frontend from /public/avatars
$avatarsDir = dirname(__DIR__) . '/public/avatars/';
if (!is_dir($avatarsDir)) {
    @mkdir($avatarsDir, 0755, true);
}
$path = $avatarsDir . $avatar;
if (!file_exists($path)) {
    echo json_encode(['error'=>'AVATAR_NOT_FOUND']); exit;
}

// Tabella unlock premium avatar (idempotente)
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

$isPremium = array_key_exists($avatar, PREMIUM_AVATAR_REQUIREMENTS);
$purchased = false;
$coinsAfter = null;
ensureTotalXpColumnAvatar($pdo);

try {
    $pdo->beginTransaction();

    if ($isPremium) {
        $req = PREMIUM_AVATAR_REQUIREMENTS[$avatar];

        $stUnlock = $pdo->prepare("
            SELECT id
            FROM avatar_unlocks
            WHERE user_id = :uid AND avatar = :avatar
            LIMIT 1
            FOR UPDATE
        ");
        $stUnlock->execute([':uid' => $uid, ':avatar' => $avatar]);
        $alreadyUnlocked = (bool)$stUnlock->fetchColumn();

        $stGp = $pdo->prepare("
            SELECT level, experience, total_experience, coins
            FROM game_progress
            WHERE user_id = :uid
            LIMIT 1
            FOR UPDATE
        ");
        $stGp->execute([':uid' => $uid]);
        $gp = $stGp->fetch(PDO::FETCH_ASSOC);
        if (!$gp) {
            $pdo->prepare("
                INSERT INTO game_progress (user_id, level, experience, total_experience, coins, inventory)
                VALUES (:uid, 1, 0, 0, 0, '{}')
            ")->execute([':uid' => $uid]);
            $gp = ['level' => 1, 'experience' => 0, 'total_experience' => 0, 'coins' => 0];
        }

        $curLevel = max(1, (int)($gp['level'] ?? 1));
        $curLevelXp = max(0, (int)($gp['experience'] ?? 0));
        $curXp = isset($gp['total_experience'])
            ? max(0, (int)$gp['total_experience'])
            : (cumulativeXpBeforeLevelAvatar($curLevel) + $curLevelXp);
        $curCoins = (int)($gp['coins'] ?? 0);

        if (!$alreadyUnlocked) {
            if ($curXp < (int)$req['xp']) {
                $pdo->rollBack();
                echo json_encode([
                    'error' => 'INSUFFICIENT_XP',
                    'required_xp' => (int)$req['xp'],
                    'current_xp' => $curXp
                ]);
                exit;
            }
            if ($curCoins < (int)$req['coins']) {
                $pdo->rollBack();
                echo json_encode([
                    'error' => 'INSUFFICIENT_COINS',
                    'required_coins' => (int)$req['coins'],
                    'current_coins' => $curCoins
                ]);
                exit;
            }

            $newCoins = max(0, $curCoins - (int)$req['coins']);
            $pdo->prepare("
                UPDATE game_progress
                SET coins = :coins, updated_at = NOW()
                WHERE user_id = :uid
            ")->execute([':coins' => $newCoins, ':uid' => $uid]);

            $pdo->prepare("
                INSERT INTO avatar_unlocks (user_id, avatar)
                VALUES (:uid, :avatar)
                ON DUPLICATE KEY UPDATE unlocked_at = unlocked_at
            ")->execute([':uid' => $uid, ':avatar' => $avatar]);

            $purchased = true;
            $coinsAfter = $newCoins;
        } else {
            $coinsAfter = $curCoins;
        }
    }

    $pdo->prepare("UPDATE users SET avatar = :a WHERE id = :id")
        ->execute([':a' => $avatar, ':id' => $uid]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('avatar_select failed: ' . $e->getMessage());
    echo json_encode(['error' => 'AVATAR_UPDATE_FAILED']);
    exit;
}

log_event($uid, 'avatar_set', $avatar);
if ($purchased) {
    add_notification($uid, "Avatar premium acquistato: {$avatar}");
} else {
    add_notification($uid, "Avatar aggiornato: {$avatar}");
}

echo json_encode([
    'ok' => true,
    'purchased' => $purchased,
    'coins' => $coinsAfter
]);
?>
