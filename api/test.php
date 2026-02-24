<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';

$tests = [];

// 1. Database
try {
    $result = $pdo->query("SELECT 1");
    $tests['database'] = ['ok' => true, 'message' => 'Database connection OK'];
} catch (Exception $e) {
    $tests['database'] = ['ok' => false, 'error' => $e->getMessage()];
}

// 2. Tables
$tables = ['users', 'game_progress', 'security_audit', 'admin_logs'];
foreach ($tables as $table) {
    try {
        $result = $pdo->query("SELECT 1 FROM $table LIMIT 1");
        $tests["table_$table"] = ['ok' => true];
    } catch (Exception $e) {
        $tests["table_$table"] = ['ok' => false, 'error' => $e->getMessage()];
    }
}

// 3. PHP version
$tests['php_version'] = ['version' => PHP_VERSION, 'ok' => version_compare(PHP_VERSION, '7.4.0', '>=')];

// 4. Session
session_start();
$tests['session'] = ['ok' => !empty(session_id()), 'session_id' => session_id()];

// 5. Required functions
$functions = ['password_hash', 'password_verify', 'json_encode', 'json_decode', 'base64_encode'];
$missing = [];
foreach ($functions as $func) {
    if (!function_exists($func)) {
        $missing[] = $func;
    }
}
$tests['functions'] = ['ok' => empty($missing), 'missing' => $missing];

echo json_encode([
    'status' => 'test_results',
    'timestamp' => date('Y-m-d H:i:s'),
    'tests' => $tests,
    'all_ok' => !array_reduce($tests, function($carry, $item) {
        return $carry || (!isset($item['ok']) || !$item['ok']);
    }, false)
]);
?>
