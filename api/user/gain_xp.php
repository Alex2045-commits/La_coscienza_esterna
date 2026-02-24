<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/auth_middleware.php';
require_once __DIR__ . '/../csrf.php';
require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../../security/security_logger.php';

header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

auth_require_csrf();
$user = auth_require_user();
$uid = (int)$user['id'];
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$ua = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';

if (!empty($user['banned_until']) && strtotime((string)$user['banned_until']) > time()) {
    security_log($pdo, $uid, 'banned_user_action_attempt', ['action' => 'gain_xp']);
    http_response_code(403);
    echo json_encode(['error' => 'ACCOUNT_BANNED']);
    exit;
}

$data = json_decode((string)file_get_contents("php://input"), true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(["error" => "INVALID_JSON"]);
    exit;
}

$action = (string)($data["action"] ?? "");
$stageFromClient = (int)($data["stage"] ?? -1);
$runToken = trim((string)($data["run_token"] ?? ""));

$rewardRanges = [
    "level_start" => ["xp" => [0, 0], "coins" => [0, 0]],
    "level_failed" => ["xp" => [0, 0], "coins" => [0, 0]],

    "l0_monster_kill" => ["xp" => [12, 20], "coins" => [0, 2]],
    "l0_elite_kill" => ["xp" => [28, 40], "coins" => [3, 6]],
    "l0_level_complete" => ["xp" => [55, 75], "coins" => [12, 20]],

    "l1_monster_kill" => ["xp" => [18, 28], "coins" => [1, 3]],
    "l1_elite_kill" => ["xp" => [38, 55], "coins" => [5, 9]],
    "l1_level_complete" => ["xp" => [80, 105], "coins" => [18, 28]],

    "l2_monster_kill" => ["xp" => [24, 36], "coins" => [2, 5]],
    "l2_elite_kill" => ["xp" => [55, 75], "coins" => [8, 14]],
    "l2_level_complete" => ["xp" => [110, 145], "coins" => [25, 38]],

    // backward compatibility
    "monster_kill" => ["xp" => [12, 20], "coins" => [0, 2]],
    "elite_kill" => ["xp" => [28, 40], "coins" => [3, 6]],
    "level_complete" => ["xp" => [55, 75], "coins" => [12, 20]]
];

$cooldownMsByAction = [
    "level_start" => 0,
    "level_failed" => 0,
    "l0_monster_kill" => 900,
    "l0_elite_kill" => 1800,
    "l0_level_complete" => 8000,
    "l1_monster_kill" => 850,
    "l1_elite_kill" => 1700,
    "l1_level_complete" => 8000,
    "l2_monster_kill" => 800,
    "l2_elite_kill" => 1600,
    "l2_level_complete" => 8000,
    "monster_kill" => 900,
    "elite_kill" => 1800,
    "level_complete" => 8000
];

$stageRules = [
    0 => [
        'monster_actions' => ['l0_monster_kill', 'monster_kill'],
        'elite_actions' => ['l0_elite_kill', 'elite_kill'],
        'complete_actions' => ['l0_level_complete', 'level_complete'],
        'min_monster' => 2,
        'min_elite' => 1,
        'max_monster' => 20,
        'max_elite' => 10,
        'min_duration_ms' => 20000
    ],
    1 => [
        'monster_actions' => ['l1_monster_kill'],
        'elite_actions' => ['l1_elite_kill'],
        'complete_actions' => ['l1_level_complete'],
        'min_monster' => 2,
        'min_elite' => 1,
        'max_monster' => 20,
        'max_elite' => 10,
        'min_duration_ms' => 24000
    ],
    2 => [
        'monster_actions' => ['l2_monster_kill'],
        'elite_actions' => ['l2_elite_kill'],
        'complete_actions' => ['l2_level_complete'],
        'min_monster' => 2,
        'min_elite' => 1,
        'max_monster' => 20,
        'max_elite' => 10,
        'min_duration_ms' => 28000
    ]
];

function xpNeededFor(int $lvl): int {
    return 50 + ($lvl - 1) * 50;
}

function cumulativeXpBeforeLevel(int $level): int {
    $lvl = max(1, $level);
    $sum = 0;
    for ($i = 1; $i < $lvl; $i++) {
        $sum += xpNeededFor($i);
    }
    return $sum;
}

function ensureTotalXpColumn(PDO $pdo): void {
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
        error_log('ensureTotalXpColumn failed: ' . $e->getMessage());
    }
}

function eventStage(string $action): int {
    if (str_starts_with($action, 'l0_') || in_array($action, ['monster_kill', 'elite_kill', 'level_complete'], true)) return 0;
    if (str_starts_with($action, 'l1_')) return 1;
    if (str_starts_with($action, 'l2_')) return 2;
    return -1;
}

if (!isset($rewardRanges[$action])) {
    http_response_code(400);
    echo json_encode(["error" => "INVALID_PROGRESS_EVENT"]);
    exit;
}

$nowMs = (int)floor(microtime(true) * 1000);
$lastByAction = $_SESSION['xp_event_last_at'] ?? [];
$lastActionAt = (int)($lastByAction[$action] ?? 0);
$requiredCooldown = (int)($cooldownMsByAction[$action] ?? 0);

if ($requiredCooldown > 0 && $lastActionAt > 0 && ($nowMs - $lastActionAt) < $requiredCooldown) {
    http_response_code(429);
    security_log($pdo, $uid, 'xp_event_rate_limited', [
        'action' => $action,
        'cooldown_ms' => $requiredCooldown,
        'delta_ms' => ($nowMs - $lastActionAt),
        'ip' => $ip
    ]);
    echo json_encode(["error" => "EVENT_RATE_LIMITED"]);
    exit;
}

$lastByAction[$action] = $nowMs;
$_SESSION['xp_event_last_at'] = $lastByAction;

ensureTotalXpColumn($pdo);

$st = $pdo->prepare("SELECT level, experience, total_experience, coins FROM game_progress WHERE user_id = :id");
$st->execute([":id" => $uid]);
$pg = $st->fetch(PDO::FETCH_ASSOC);

if (!$pg) {
    $pdo->prepare("
        INSERT INTO game_progress (user_id, level, experience, total_experience, coins, inventory)
        VALUES (:id, 1, 0, 0, 0, '[]')
    ")->execute([":id" => $uid]);
    $pg = ["level" => 1, "experience" => 0, "total_experience" => 0, "coins" => 0];
}

$level = (int)$pg["level"];
$xp = (int)$pg["experience"];
$totalXp = isset($pg["total_experience"])
    ? (int)$pg["total_experience"]
    : (cumulativeXpBeforeLevel($level) + $xp);
$coins = (int)$pg["coins"];
$currentLevel = $level;
$currentXp = $xp;
$currentTotalXp = $totalXp;
$currentCoins = $coins;

$fingerprint = hash('sha256', $ip . '|' . $ua);
$eventStage = eventStage($action);

if ($action === "level_start") {
    $stage = $stageFromClient >= 0 ? $stageFromClient : 0;
    if (!isset($stageRules[$stage])) {
        http_response_code(400);
        echo json_encode(["error" => "INVALID_STAGE"]);
        exit;
    }

    $newRunToken = bin2hex(random_bytes(24));
    $_SESSION['anti_cheat_run'] = [
        'token' => $newRunToken,
        'stage' => $stage,
        'started_at_ms' => $nowMs,
        'fingerprint' => $fingerprint,
        'counts' => ['monster' => 0, 'elite' => 0],
        'events' => 0
    ];
    $_SESSION['run_progress_snapshot'] = [
        'level' => $currentLevel,
        'experience' => $currentXp,
        'total_experience' => $currentTotalXp,
        'coins' => $currentCoins
    ];

    echo json_encode([
        "ok" => true,
        "action" => $action,
        "stage" => $stage,
        "run_token" => $newRunToken,
        "xpEarned" => 0,
        "coinsEarned" => 0,
        "new_level" => $currentLevel,
        "new_experience" => $currentXp,
        "new_total_experience" => $currentTotalXp,
        "levels_gained" => 0,
        "coins_now" => $currentCoins
    ]);
    exit;
}

$run = $_SESSION['anti_cheat_run'] ?? null;
if (!is_array($run) || empty($run['token'])) {
    http_response_code(409);
    security_log($pdo, $uid, 'anti_cheat_run_missing', ['action' => $action, 'ip' => $ip]);
    echo json_encode(["error" => "RUN_NOT_STARTED"]);
    exit;
}

$runStage = (int)($run['stage'] ?? -1);
if (!isset($stageRules[$runStage])) {
    unset($_SESSION['anti_cheat_run']);
    http_response_code(409);
    echo json_encode(["error" => "RUN_INVALID"]);
    exit;
}

if ($runToken === '' || !hash_equals((string)$run['token'], $runToken)) {
    handleSecurityScore($ip, 8, 'invalid_run_token');
    security_log($pdo, $uid, 'anti_cheat_invalid_token', ['action' => $action, 'ip' => $ip]);
    http_response_code(403);
    echo json_encode(["error" => "INVALID_RUN_TOKEN"]);
    exit;
}

if (!hash_equals((string)$run['fingerprint'], $fingerprint)) {
    handleSecurityScore($ip, 8, 'fingerprint_mismatch');
    security_log($pdo, $uid, 'anti_cheat_fingerprint_mismatch', ['action' => $action, 'ip' => $ip]);
    http_response_code(403);
    echo json_encode(["error" => "RUN_FINGERPRINT_MISMATCH"]);
    exit;
}

$runAgeMs = $nowMs - (int)$run['started_at_ms'];
if ($runAgeMs > (45 * 60 * 1000)) {
    unset($_SESSION['anti_cheat_run'], $_SESSION['run_progress_snapshot']);
    http_response_code(409);
    echo json_encode(["error" => "RUN_EXPIRED"]);
    exit;
}

$rules = $stageRules[$runStage];
if ($eventStage >= 0 && $eventStage !== $runStage && $action !== 'level_failed') {
    handleSecurityScore($ip, 6, 'cross_stage_event');
    security_log($pdo, $uid, 'anti_cheat_cross_stage_event', [
        'run_stage' => $runStage,
        'event_stage' => $eventStage,
        'action' => $action,
        'ip' => $ip
    ]);
    http_response_code(403);
    echo json_encode(["error" => "STAGE_MISMATCH"]);
    exit;
}

if ($action === "level_failed") {
    $snapshot = $_SESSION['run_progress_snapshot'] ?? null;
    if (is_array($snapshot) && isset($snapshot['level'], $snapshot['experience'], $snapshot['coins'])) {
        $targetLevel = max(1, (int)$snapshot['level']);
        $targetXp = max(0, (int)$snapshot['experience']);
        $targetTotalXp = isset($snapshot['total_experience'])
            ? max(0, (int)$snapshot['total_experience'])
            : (cumulativeXpBeforeLevel($targetLevel) + $targetXp);
        $targetCoins = max(0, (int)$snapshot['coins']);

        if ($targetLevel > $currentLevel) $targetLevel = $currentLevel;
        if ($targetTotalXp > $currentTotalXp) $targetTotalXp = $currentTotalXp;
        if ($targetCoins > $currentCoins) $targetCoins = $currentCoins;

        $stFail = $pdo->prepare("
            UPDATE game_progress
            SET level = :level, experience = :exp, total_experience = :total_exp, coins = :coins, updated_at = NOW()
            WHERE user_id = :id
        ");
        $stFail->execute([
            ":level" => $targetLevel,
            ":exp" => $targetXp,
            ":total_exp" => $targetTotalXp,
            ":coins" => $targetCoins,
            ":id" => $uid
        ]);

        $lostXp = max(0, $currentTotalXp - $targetTotalXp);
        $lostCoins = max(0, $currentCoins - $targetCoins);
        unset($_SESSION['run_progress_snapshot'], $_SESSION['anti_cheat_run']);

        if ($lostXp > 0 || $lostCoins > 0) {
            add_notification($uid, "Run persa: -{$lostXp} XP, -{$lostCoins} coin.");
        }

        echo json_encode([
            "ok" => true,
            "action" => $action,
            "xpEarned" => 0,
            "coinsEarned" => 0,
            "lost_xp" => $lostXp,
            "lost_coins" => $lostCoins,
            "new_level" => $targetLevel,
            "new_experience" => $targetXp,
            "new_total_experience" => $targetTotalXp,
            "levels_gained" => 0,
            "coins_now" => $targetCoins
        ]);
        exit;
    }

    unset($_SESSION['anti_cheat_run']);
    echo json_encode([
        "ok" => true,
        "action" => $action,
        "xpEarned" => 0,
        "coinsEarned" => 0,
        "new_level" => $currentLevel,
        "new_experience" => $currentXp,
        "new_total_experience" => $currentTotalXp,
        "levels_gained" => 0,
        "coins_now" => $currentCoins
    ]);
    exit;
}

$isMonster = in_array($action, $rules['monster_actions'], true);
$isElite = in_array($action, $rules['elite_actions'], true);
$isComplete = in_array($action, $rules['complete_actions'], true);

if (!$isMonster && !$isElite && !$isComplete) {
    handleSecurityScore($ip, 5, 'invalid_action_for_stage');
    security_log($pdo, $uid, 'anti_cheat_invalid_stage_action', [
        'stage' => $runStage,
        'action' => $action,
        'ip' => $ip
    ]);
    http_response_code(403);
    echo json_encode(["error" => "INVALID_ACTION_FOR_STAGE"]);
    exit;
}

$run['events'] = (int)($run['events'] ?? 0) + 1;
if ($run['events'] > 120) {
    handleSecurityScore($ip, 10, 'too_many_events_in_run');
    security_log($pdo, $uid, 'anti_cheat_too_many_events', ['stage' => $runStage, 'ip' => $ip]);
    http_response_code(429);
    echo json_encode(["error" => "RUN_EVENT_LIMIT"]);
    exit;
}

if ($isMonster) {
    $run['counts']['monster'] = (int)($run['counts']['monster'] ?? 0) + 1;
    if ($run['counts']['monster'] > (int)$rules['max_monster']) {
        handleSecurityScore($ip, 8, 'monster_event_over_limit');
        security_log($pdo, $uid, 'anti_cheat_monster_over_limit', ['stage' => $runStage, 'ip' => $ip]);
        http_response_code(429);
        echo json_encode(["error" => "MONSTER_EVENT_LIMIT"]);
        exit;
    }
}

if ($isElite) {
    $run['counts']['elite'] = (int)($run['counts']['elite'] ?? 0) + 1;
    if ($run['counts']['elite'] > (int)$rules['max_elite']) {
        handleSecurityScore($ip, 8, 'elite_event_over_limit');
        security_log($pdo, $uid, 'anti_cheat_elite_over_limit', ['stage' => $runStage, 'ip' => $ip]);
        http_response_code(429);
        echo json_encode(["error" => "ELITE_EVENT_LIMIT"]);
        exit;
    }
}

if ($isComplete) {
    $monsterCount = (int)($run['counts']['monster'] ?? 0);
    $eliteCount = (int)($run['counts']['elite'] ?? 0);
    if ($monsterCount < (int)$rules['min_monster'] || $eliteCount < (int)$rules['min_elite']) {
        handleSecurityScore($ip, 8, 'early_level_complete');
        security_log($pdo, $uid, 'anti_cheat_early_complete', [
            'stage' => $runStage,
            'monster_count' => $monsterCount,
            'elite_count' => $eliteCount,
            'ip' => $ip
        ]);
        http_response_code(403);
        echo json_encode(["error" => "EARLY_LEVEL_COMPLETE"]);
        exit;
    }
    if ($runAgeMs < (int)$rules['min_duration_ms']) {
        handleSecurityScore($ip, 8, 'run_too_short');
        security_log($pdo, $uid, 'anti_cheat_run_too_short', [
            'stage' => $runStage,
            'run_age_ms' => $runAgeMs,
            'ip' => $ip
        ]);
        http_response_code(403);
        echo json_encode(["error" => "RUN_TOO_SHORT"]);
        exit;
    }
}

$_SESSION['anti_cheat_run'] = $run;

$xpMin = (int)$rewardRanges[$action]['xp'][0];
$xpMax = (int)$rewardRanges[$action]['xp'][1];
$coinsMin = (int)$rewardRanges[$action]['coins'][0];
$coinsMax = (int)$rewardRanges[$action]['coins'][1];
$xpEarned = random_int($xpMin, $xpMax);
$coinsEarned = random_int($coinsMin, $coinsMax);

$xp += $xpEarned;
$totalXp += $xpEarned;
$coins += $coinsEarned;
$levelsGained = 0;

while ($xp >= xpNeededFor($level)) {
    $xp -= xpNeededFor($level);
    $level++;
    $levelsGained++;
    $coins += (10 + ($level - 1) * 5);
}

if ($levelsGained > 0) {
    add_notification($uid, "Hai guadagnato {$levelsGained} livello/i. Ora sei livello {$level}.");
}

if ($isComplete) {
    add_notification($uid, "Livello completato: +{$xpEarned} XP e +{$coinsEarned} coin.");
    unset($_SESSION['run_progress_snapshot'], $_SESSION['anti_cheat_run']);
}

$st2 = $pdo->prepare("
    UPDATE game_progress
    SET level = :level, experience = :exp, total_experience = :total_exp, coins = :coins, updated_at = NOW()
    WHERE user_id = :id
");
$st2->execute([
    ":level" => $level,
    ":exp" => $xp,
    ":total_exp" => $totalXp,
    ":coins" => $coins,
    ":id" => $uid,
]);

log_event($uid, "gain_xp", "Action=$action, XP=$xpEarned, NewLVL=$level");
security_log($pdo, $uid, 'user_gain_xp', [
    'action' => $action,
    'xp_earned' => $xpEarned,
    'coins_earned' => $coinsEarned,
    'level' => $level,
    'experience' => $xp,
    'total_experience' => $totalXp,
    'coins' => $coins,
    'ip' => $ip
]);

echo json_encode([
    "ok" => true,
    "action" => $action,
    "xpEarned" => $xpEarned,
    "coinsEarned" => $coinsEarned,
    "new_level" => $level,
    "new_experience" => $xp,
    "new_total_experience" => $totalXp,
    "levels_gained" => $levelsGained,
    "coins_now" => $coins,
    "run_token" => isset($_SESSION['anti_cheat_run']['token']) ? (string)$_SESSION['anti_cheat_run']['token'] : null
]);
exit;
?>
