<?php
declare(strict_types=1);

require_once __DIR__ . "/config.php";

header("Content-Type: application/json; charset=utf-8");

// Funzione per validare lo stato dell'utente
function validateUserState(int $id, PDO $pdo): array {
    $st = $pdo->prepare("SELECT id, username, role, avatar, deleted_at, banned_until FROM users WHERE id = :id");
    $st->execute([":id"=>$id]);
    $u = $st->fetch(PDO::FETCH_ASSOC);

    if (!$u) {
        http_response_code(403);
        echo json_encode(["error"=>"ACCOUNT_NOT_FOUND"]);
        exit;
    }

    // ❗ NON blocchiamo eliminati → servono per RIPRISTINO
    if ($u["banned_until"] && strtotime($u["banned_until"]) > time()) {
        http_response_code(403);
        echo json_encode(["error"=>"ACCOUNT_BANNED"]);
        exit;
    }

    return $u;
}
echo json_encode(["ok" => true]);
?>