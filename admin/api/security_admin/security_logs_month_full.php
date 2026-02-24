<?php
declare(strict_types=1);

require_once __DIR__ . '/../../../api/config.php';
require_once __DIR__ . '/../../../api/startSecureAdminSession.php';
require_once __DIR__ . '/../../../api/auth_middleware.php';
require_once __DIR__ . '/../boostrap_local_admin.php'; // ✅ bootstrap locale

startSecureAdminSession();

// CORS globale
$allowedOrigin = 'http://localhost:4000';
header("Access-Control-Allow-Origin: $allowedOrigin");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: X-CSRF-Token, Content-Type");

// Preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// CSRF token
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
$csrfToken = $_SESSION['csrf_token'];

// CSRF header dal client
$csrfHeader = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
error_log("CSRF header ricevuto: " . ($csrfHeader ?: 'VUOTO'));
error_log("CSRF sessione: $csrfToken");

// 🔒 Verifica admin
$admin = auth_require_admin();
$adminId = $admin['id'];

// Controllo CSRF SOLO per metodi che modificano stato
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD', 'OPTIONS'], true)) {
    if (!$csrfHeader || $csrfHeader !== $csrfToken) {
        http_response_code(403);
        echo json_encode(['error' => 'CSRF_MISMATCH']);
        exit;
    }
}

// ---------------------------
// Time range (usa timezone server/DB senza conversioni forzate)
// ---------------------------
$serverTz = new DateTimeZone(date_default_timezone_get());
$start = new DateTime('first day of this month 00:00:00', $serverTz);
$end   = new DateTime('first day of next month 00:00:00', $serverTz);

// ---------------------------
// Query con LIMIT/OFFSET
// ---------------------------
$sql = "
  SELECT
  l.id,
  l.user_id,
  l.event,
  l.severity,
  l.ip,
  l.created_at,
  CASE WHEN rl.log_id IS NULL THEN 0 ELSE 1 END AS is_read
  FROM security_logs l
  LEFT JOIN security_read_logs rl
  ON rl.log_id = l.id
  AND rl.admin_id = :admin_id
  WHERE l.created_at >= :start
  AND l.created_at <  :end
  ORDER BY l.created_at DESC
";

$stmt = $pdo->prepare($sql);
$stmt->bindValue(':admin_id', $adminId, PDO::PARAM_INT);
$stmt->bindValue(':start', $start->format('Y-m-d H:i:s'));
$stmt->bindValue(':end', $end->format('Y-m-d H:i:s'));
$stmt->execute();

$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// ---------------------------
// Totale log (per paginazione)
$cntStmt = $pdo->prepare("
    SELECT COUNT(*) as total
    FROM security_logs
    WHERE created_at >= :start
      AND created_at < :end
");
$cntStmt->execute([
    ':start' => $start->format('Y-m-d H:i:s'),
    ':end'   => $end->format('Y-m-d H:i:s')
]);

// ---------------------------
// Normalizza output
// ---------------------------
$logs  = [];
$stats = [];

foreach ($rows as $row) {
    $createdAt = (string)$row['created_at'];
    $dayKey    = substr($createdAt, 0, 10);

    $logs[] = [
        'id'         => (int) $row['id'],
        'user_id'    => $row['user_id'] !== null ? (int)$row['user_id'] : null,
        'event'      => (string) $row['event'],
        'severity'   => (string) $row['severity'],
        'ip'         => (string) $row['ip'],
        'created_at' => $createdAt,
        'read'       => (bool) $row['is_read']
    ];

    $stats[$dayKey] = ($stats[$dayKey] ?? 0) + 1;
}

// ---------------------------
// Response JSON
// ---------------------------
echo json_encode([
    'ok'          => true,
    'logs'        => $logs,
    'stats'       => $stats,
]);
