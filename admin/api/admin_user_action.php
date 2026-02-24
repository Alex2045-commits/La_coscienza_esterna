<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../../api/auth_middleware.php';
require_once __DIR__ . '/boostrap_local_admin.php'; // ✅ bootstrap locale

// 🔒 Richiama admin con verifica ruolo + 2FA
$admin = auth_require_admin();

header("Content-Type: application/json; charset=utf-8");
if(isLocalhost()) {
    header("Access-Control-Allow-Origin: http://localhost:8000");
    header("Access-Control-Allow-Credentials: true");
}

$current = auth_require_admin();

/* ================= INPUT ================= */
$data = json_decode(file_get_contents("php://input"), true);

if (!$data || !isset($data["action"], $data["id"])) {
    http_response_code(400);
    exit(json_encode(["ok"=>false,"error"=>"BAD_REQUEST"]));
}

$action = $data["action"];
$id     = (int)$data["id"];

/* ================= BLOCCI DI SICUREZZA ================= */

// ❌ no self action
if ($id === (int)$current["id"] && in_array($action, ["delete","ban","role"], true)) {
    exit(json_encode(["ok"=>false,"error"=>"CANNOT_MODIFY_SELF"]));
}

// carica target
$st = $pdo->prepare("SELECT id, role, is_super_admin FROM users WHERE id=?");
$st->execute([$id]);
$target = $st->fetch(PDO::FETCH_ASSOC);

if (!$target) {
    http_response_code(404);
    exit(json_encode(["ok"=>false,"error"=>"INVALID_USER"]));
}

// ❌ super-admin intoccabile
if ((int)$target["is_super_admin"] === 1) {
    exit(json_encode(["ok"=>false,"error"=>"SUPER_ADMIN_PROTECTED"]));
}

// ❌ solo super-admin può promuovere admin
if (
    $action === "role" &&
    ($data["role"] ?? "") === "admin" &&
    (int)$current["is_super_admin"] !== 1
) {
    exit(json_encode(["ok"=>false,"error"=>"ONLY_SUPER_ADMIN"]));
}

// ❌ ultimo admin SOLO se stai eliminando un admin
if ($action === "delete" && $target["role"] === "admin") {
    $cnt = (int)$pdo
        ->query("SELECT COUNT(*) FROM users WHERE role='admin' AND deleted_at IS NULL")
        ->fetchColumn();

    if ($cnt <= 1) {
        exit(json_encode(["ok"=>false,"error"=>"LAST_ADMIN_PROTECTED"]));
    }
}

/* ================= AZIONI ================= */

try {

    switch ($action) {

        case "delete":
            $st = $pdo->prepare("
                UPDATE users
                SET deleted_at = NOW(),
                    purge_at = NOW() + INTERVAL 30 DAY
                WHERE id = ?
            ");
            $st->execute([$id]);
            break;

        case "restore":
            $st = $pdo->prepare("
                UPDATE users
                SET deleted_at = NULL
                WHERE id = ? AND deleted_at IS NOT NULL
            ");
            $st->execute([$id]);
            break;

        case "role":
            if (!in_array($data["role"] ?? "", ["admin","user"], true)) {
                throw new Exception("INVALID_ROLE");
            }

            $st = $pdo->prepare("
                UPDATE users
                SET role = ?
                WHERE id = ? AND deleted_at IS NULL
            ");
            $st->execute([$data["role"], $id]);
            break;

        case "ban":
            $duration = $data["duration"] ?? "24h";

            if ($duration === "perma") {
                // BAN PERMANENTE → soft delete + banned_until massimo
                $stmt = $pdo->prepare("
                    UPDATE users
                    SET deleted_at = NOW(),
                        banned_until = '9999-12-31 23:59:59'
                    WHERE id = :id
                ");
                $stmt->execute([':id' => $id]);

                // opzionale: anonimizza dati sensibili
                $stmt = $pdo->prepare("
                    UPDATE users
                    SET email = NULL, username = CONCAT('deleted_', id)
                    WHERE id = :id
                ");
                $stmt->execute([':id' => $id]);

                $event = 'account_deleted_permanently';

            } else {
                // BAN TEMPORANEO
                $hours = (int)$duration;
                $until = date("Y-m-d H:i:s", time() + ($hours * 3600));

                $stmt = $pdo->prepare("
                    UPDATE users
                    SET banned_until = :until
                    WHERE id = :id AND deleted_at IS NULL
                ");
                $stmt->execute([
                    ":until" => $until,
                    ":id" => $id
                ]);

                $event = 'account_banned_temporarily';
            }

            // Log sicurezza
            $stmt = $pdo->prepare("
                INSERT INTO security_audit (user_id, event, ip)
                VALUES (:uid, :event, 'admin')
            ");
            $stmt->execute([
                ':uid' => $id,
                ':event' => $event
            ]);

            // Alert admin
            $stmt = $pdo->prepare("
                INSERT INTO admin_alerts (level, message)
                VALUES ('critical', :msg)
            ");
            $stmt->execute([
                ':msg' => $duration === 'perma'
                    ? "🚨 Utente ID {$id} ELIMINATO PERMANENTEMENTE"
                    : "⚠️ Utente ID {$id} bannato temporaneamente"
            ]);
            break;


        default:
            throw new Exception("INVALID_ACTION");
    }

    echo json_encode(["ok"=>true]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["ok"=>false,"error"=>$e->getMessage()]);
}
?>