<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ bootstrap locale

// 🔒 Richiama admin con verifica ruolo + 2FA
$admin = auth_require_admin();

$q = trim($_GET['q'] ?? '');
$role = $_GET['role'] ?? '';
$page = max(1, intval($_GET['page'] ?? 1));
$perPage = max(1, min(200, intval($_GET['per_page'] ?? 20)));

// === SORT SAFE ===
$allowedSort = ['id' => 'id', 'username' => 'username', 'email' => 'email', 'role' => 'role'];
$sortBy = $_GET['sort_by'] ?? 'id';
$orderCol = $allowedSort[$sortBy] ?? 'id';
$sortDir = (($_GET['sort_dir'] ?? 'desc') === 'asc') ? 'ASC' : 'DESC';
$showDeleted = (($_GET['show_deleted'] ?? '0') === '1');

$where = ' WHERE 1=1 ';
$params = [];

if ($q !== '') {
    $where .= ' AND (username LIKE :q OR email LIKE :q)';
    $params[':q'] = "%$q%";
}
if ($role !== '') {
    $where .= ' AND role = :role';
    $params[':role'] = $role;
}

// total
$totalSt = $pdo->prepare("SELECT COUNT(*) FROM users $where");
$totalSt->execute($params);
$total = (int)$totalSt->fetchColumn();

$totalPages = max(1, (int)ceil($total / $perPage));
$offset = ($page - 1) * $perPage;

$sql = "SELECT 
            u.id, 
            u.username, 
            u.email, 
            u.role, 
            u.avatar, 
            u.deleted_at, 
            u.banned_until,
            u.last_activity,
            COALESCE(s.score, 0) AS security_score
        FROM users u
        LEFT JOIN security_ip_score s ON s.ip = u.last_ip
        $where
        ORDER BY $orderCol $sortDir
        LIMIT :limit OFFSET :offset";

$st = $pdo->prepare($sql);
foreach ($params as $k => $v) {
    $st->bindValue($k, $v);
}
$st->bindValue(':limit', $perPage, PDO::PARAM_INT);
$st->bindValue(':offset', $offset, PDO::PARAM_INT);
$st->execute();

$users = $st->fetchAll(PDO::FETCH_ASSOC);

echo json_encode([
    'page' => $page,
    'perPage' => $perPage,
    'total' => $total,
    'totalPages' => $totalPages,
    'users' => $users
]);
exit;
?>