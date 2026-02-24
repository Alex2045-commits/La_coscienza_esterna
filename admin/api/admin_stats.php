<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ bootstrap locale

// 🔒 Richiama admin con verifica ruolo + 2FA (funzionerà su localhost e produzione)
$admin = auth_require_admin();

header('Content-Type: application/json; charset=utf-8');

try {
    $hasDeletedAt = false;
    $hasLastLogout = false;
    try {
        $colStmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'deleted_at'");
        $hasDeletedAt = (bool)$colStmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $hasDeletedAt = false;
    }
    try {
        $colStmt2 = $pdo->query("SHOW COLUMNS FROM users LIKE 'last_logout'");
        $hasLastLogout = (bool)$colStmt2->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $hasLastLogout = false;
    }

    // ===============================
    // Statistiche utenti
    // ===============================
    $activeUsersSql = "
        SELECT COUNT(*)
        FROM users
        WHERE last_activity IS NOT NULL
          AND last_activity > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
    ";
    if ($hasDeletedAt) {
        $activeUsersSql = str_replace("WHERE last_activity", "WHERE deleted_at IS NULL AND last_activity", $activeUsersSql);
    }
    if ($hasLastLogout) {
        $activeUsersSql = str_replace(
            "AND last_activity > DATE_SUB(NOW(), INTERVAL 10 MINUTE)",
            "AND last_activity > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
             AND (last_logout IS NULL OR last_activity > last_logout)",
            $activeUsersSql
        );
    }
    $activeUsers = (int)$pdo->query($activeUsersSql)->fetchColumn();

    // Conteggia tutti gli account non eliminati (admin + user)
    if ($hasDeletedAt) {
        $liveUsers = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL")->fetchColumn();
        $deletedUsers = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL")->fetchColumn();
        $totalUsers = $liveUsers + $deletedUsers;
    } else {
        $totalUsers = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        $liveUsers = $totalUsers;
        $deletedUsers = 0;
    }

    // ===============================
    // Statistiche logs
    // ===============================
    $totalLogs  = (int)$pdo->query("SELECT COUNT(*) FROM logs")->fetchColumn();
    $todayLogs  = (int)$pdo->query("SELECT COUNT(*) FROM logs WHERE DATE(created_at) = CURDATE()")->fetchColumn();

    $stmt = $pdo->prepare("
        SELECT DATE(created_at) AS day, COUNT(*) AS qty
        FROM logs
        WHERE created_at >= CURDATE() - INTERVAL 7 DAY
        GROUP BY DATE(created_at)
        ORDER BY day ASC
    ");
    $stmt->execute();
    $logs7 = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($logs7 as &$r) {
        $r['count'] = (int)$r['qty'];
        unset($r['qty']);
    }

    // ===============================
    // Risposta JSON
    // ===============================
    echo json_encode([
        'ok' => true,
        'stats' => [
            'total_users'   => $totalUsers,
            'active_users'  => $activeUsers,
            'active_now_users' => $activeUsers, // compat con frontend attuale
            'live_users'    => $liveUsers,
            'deleted_users' => $deletedUsers,
            'total_logs'    => $totalLogs,
            'today_logs'    => $todayLogs,
            'last7days'     => $logs7
        ]
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
