<?php
// list.php — Admin Security Logs (High-Level)

require_once __DIR__ . '/../../../api/auth_middleware.php';
require_once __DIR__ . '/../../../api/config.php';
require_once __DIR__ . '/../boostrap_local_admin.php';

try {
    $admin = auth_require_admin();
    $adminId = (int)($admin['id'] ?? ($_SESSION['admin_id'] ?? 0));

    header('Content-Type: application/json; charset=utf-8');
    header("Access-Control-Allow-Origin: http://localhost:4000");
    header("Access-Control-Allow-Credentials: true");

    // --- Parametri GET ---
    $page     = max(1, (int) ($_GET['page'] ?? 1));
    $perPage  = max(1, min(500, (int) ($_GET['per_page'] ?? 10)));
    $search   = trim($_GET['q'] ?? '');
    $offset   = ($page - 1) * $perPage;

    // --- WHERE conditions dinamiche ---
    $where = [];
    $params = [];

    if ($search !== '') {
        $where[] = "(l.event LIKE :search OR l.ip LIKE :search OR l.user_id LIKE :search)";
        $params[':search'] = "%$search%";
    }

    $whereSql = count($where) ? "WHERE " . implode(" AND ", $where) : "";

    // --- Conteggio totale ---
    $countStmt = $pdo->prepare("
    SELECT COUNT(*)
    FROM security_logs l
    $whereSql
");
    $countStmt->execute($params);
    $totalLogs = (int)$countStmt->fetchColumn();
    $totalPages = (int) ceil($totalLogs / $perPage);

    // --- Query principale (paginated) ---
    $sql = "
    SELECT
      l.id,
      l.user_id,
      l.event,
      l.ip,
      l.created_at,
      CASE WHEN rl.log_id IS NULL THEN 0 ELSE 1 END AS is_read
    FROM security_logs l
    LEFT JOIN security_read_logs rl
      ON rl.log_id = l.id
     AND rl.admin_id = :admin_id
    $whereSql
    ORDER BY l.created_at DESC
    LIMIT $perPage OFFSET $offset
";
    $stmt = $pdo->prepare($sql);
    foreach ($params as $k => $v) $stmt->bindValue($k, $v);
    $stmt->bindValue(':admin_id', $adminId, PDO::PARAM_INT);
    $stmt->execute();
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // --- Normalizza tipi e flag lettura ---
    foreach ($logs as &$log) {
        $log['id']        = (int)$log['id'];
        $log['user_id']   = $log['user_id'] !== null ? (int)$log['user_id'] : null;
        $log['read']      = (bool)$log['is_read'];
        unset($log['is_read']);
        $log['created_at'] = (string)$log['created_at'];
    }

    // --- Statistiche giornaliere per grafico ---
    $statsStmt = $pdo->prepare("
    SELECT DATE(l.created_at) AS day, COUNT(*) AS total
    FROM security_logs l
    $whereSql
    GROUP BY day
    ORDER BY day ASC
");
    $statsStmt->execute($params);
    $statsRaw = $statsStmt->fetchAll(PDO::FETCH_ASSOC);
    $stats = [];
    foreach ($statsRaw as $row) $stats[$row['day']] = (int)$row['total'];

    // --- Output JSON completo ---
    echo json_encode([
        'ok'          => true,
        'logs'        => $logs,
        'stats'       => $stats,
        'page'        => $page,
        'per_page'    => $perPage,
        'total_logs'  => $totalLogs,
        'total_pages' => $totalPages
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    $isDev = (($_ENV['APP_ENV'] ?? getenv('APP_ENV') ?: 'prod') === 'dev');
    echo json_encode([
        'ok' => false,
        'error' => 'SECURITY_LIST_FAILED',
        'message' => $isDev ? $e->getMessage() : 'Internal server error'
    ]);
}
