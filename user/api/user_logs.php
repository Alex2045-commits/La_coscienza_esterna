<?php
// ===============================
// user_logs.php
// ===============================

header('Content-Type: application/json');
session_start();

// ======== Connessione DB ========
require_once __DIR__ . "/../../api/auth_middleware.php";
require_once __DIR__ . "/../../api/startSecureSession.php";
require_once __DIR__ . "/../../api/csrf.php";
require_once __DIR__ . "/../../api/utils.php";

// ======== Verifica login ========
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode([
        'ok' => false,
        'error' => 'Non autenticato'
    ]);
    exit;
}

$user_id = intval($_SESSION['user_id']);

// ======== Parametri paginazione ========
$page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
$perPage = isset($_GET['per_page']) ? max(1, intval($_GET['per_page'])) : 10;
$search = isset($_GET['q']) ? trim($_GET['q']) : '';

// ======== Costruisci query ========
$where = "user_id = :user_id";
$params = [':user_id' => $user_id];

if ($search) {
    $where .= " AND action LIKE :search";
    $params[':search'] = "%$search%";
}

// Conteggio totale
$stmt = $pdo->prepare("SELECT COUNT(*) FROM logs WHERE $where");
$stmt->execute($params);
$total = (int)$stmt->fetchColumn();

// Paginazione
$totalPage = max(1, ceil($total / $perPage));
$offset = ($page - 1) * $perPage;

// Recupero log
$stmt = $pdo->prepare("
    SELECT id, action, ip, created_at, deleted_at, user_id
    FROM logs
    WHERE $where
    ORDER BY created_at DESC
    LIMIT :offset, :perPage
");

$stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
$stmt->bindValue(':perPage', $perPage, PDO::PARAM_INT);
foreach ($params as $k => $v) {
    if ($k !== ':offset' && $k !== ':perPage') $stmt->bindValue($k, $v);
}
$stmt->execute();

$logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

// ======== Risposta JSON ========
echo json_encode([
    'ok' => true,
    'logs' => $logs,
    'total' => $total,
    'total_page' => $totalPage,
    'page' => $page
]);
