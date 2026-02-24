<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/user/auth_middleware.php';
require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/utils.php';

header('Content-Type: application/json; charset=utf-8');

try {
    auth_require_csrf();
    $user = auth_require_user();
    $uid = (int)$user['id'];

    if (!isset($_FILES['avatar'])) {
        http_response_code(400);
        echo json_encode(['error' => 'NO_FILE']);
        exit;
    }

    $file = $_FILES['avatar'];
    $uploadError = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($uploadError !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'UPLOAD_ERROR', 'code' => $uploadError]);
        exit;
    }

    $tmp = (string)($file['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        http_response_code(400);
        echo json_encode(['error' => 'INVALID_UPLOAD']);
        exit;
    }

    $size = (int)($file['size'] ?? 0);
    if ($size <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'EMPTY_FILE']);
        exit;
    }
    if ($size > 2 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['error' => 'FILE_TOO_LARGE']);
        exit;
    }

    $mime = '';
    if (function_exists('finfo_open')) {
        $fi = @finfo_open(FILEINFO_MIME_TYPE);
        if ($fi) {
            $mime = (string)@finfo_file($fi, $tmp);
            @finfo_close($fi);
        }
    }
    if ($mime === '' && function_exists('mime_content_type')) {
        $mime = (string)@mime_content_type($tmp);
    }
    if ($mime === '' && function_exists('getimagesize')) {
        $img = @getimagesize($tmp);
        $mime = (string)($img['mime'] ?? '');
    }

    $allowed = ['image/png', 'image/jpeg'];
    if (!in_array($mime, $allowed, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'INVALID_FORMAT', 'mime' => $mime]);
        exit;
    }

    $ext = $mime === 'image/png' ? 'png' : 'jpg';

    // avatars are served by frontend from /public/avatars
    $avatarsDir = dirname(__DIR__) . '/public/avatars/';
    if (!is_dir($avatarsDir) && !@mkdir($avatarsDir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'AVATAR_DIR_CREATE_FAILED']);
        exit;
    }

    $newName = "custom_{$uid}_" . time() . ".{$ext}";
    $dest = $avatarsDir . $newName;
    if (!@move_uploaded_file($tmp, $dest)) {
        http_response_code(500);
        echo json_encode(['error' => 'MOVE_FAILED']);
        exit;
    }

    $st = $pdo->prepare("UPDATE users SET avatar = :a WHERE id = :id");
    $st->execute([":a" => $newName, ":id" => $uid]);

    add_notification($uid, "Avatar caricato con successo.");
    log_event($uid, 'avatar_upload', $newName);

    echo json_encode(['ok' => true, 'avatar' => $newName]);
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'SERVER_ERROR']);
    exit;
}
?>
