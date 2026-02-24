<?php
declare(strict_types=1);
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/startSecureSession.php';
require_once __DIR__ . '/user/auth_middleware.php';
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

$payload = auth_require_user();
$uid = (int)$payload['id'];

// Legacy mode: ?limit=50 -> ritorna array semplice (retrocompatibile)
if (isset($_GET['limit']) && !isset($_GET['page']) && !isset($_GET['per_page'])) {
    $limit = (int)$_GET['limit'];
    $limit = max(1, min($limit, 500));

    $stmt = $pdo->prepare("
        SELECT id, message, created_at
        FROM notifications
        WHERE user_id = :uid
        ORDER BY id DESC
        LIMIT :limit
    ");
    $stmt->bindValue(':uid', $uid, PDO::PARAM_INT);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    exit;
}

// Paginated mode (nuovo): ?page=1&per_page=10
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
$perPage = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 10;
$page = max(1, $page);
$perPage = max(1, min($perPage, 50));
$offset = ($page - 1) * $perPage;

$countStmt = $pdo->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = :uid");
$countStmt->execute([':uid' => $uid]);
$total = (int)$countStmt->fetchColumn();
$totalPages = max(1, (int)ceil($total / $perPage));
if ($page > $totalPages) {
    $page = $totalPages;
    $offset = ($page - 1) * $perPage;
}

$stmt = $pdo->prepare("
    SELECT id, message, created_at
    FROM notifications
    WHERE user_id = :uid
    ORDER BY id DESC
    LIMIT :limit OFFSET :offset
");
$stmt->bindValue(':uid', $uid, PDO::PARAM_INT);
$stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
$stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
$stmt->execute();
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode([
    'notifications' => $rows,
    'total' => $total,
    'page' => $page,
    'per_page' => $perPage,
    'total_pages' => $totalPages
]);
exit;
