<?php
function isUserOnline(int $userId, PDO $pdo): bool {
    // Imposta la soglia di tempo (10 minuti)
    $timeout = 10 * 60;  // 10 minuti in secondi

    // Ottieni i dati di ultimo accesso e di logout
    $stmt = $pdo->prepare("SELECT last_activity, last_logout FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        // Se non c'è mai stato un logout, considera l'utente online
        if ($user['last_logout'] === null) {
            return true;
        }

        // Se il logout è dopo l'ultimo accesso, considera l'utente offline
        if (strtotime($user['last_logout']) > strtotime($user['last_activity'])) {
            return false;
        }

        // Se l'ultimo accesso è più recente del timeout (10 minuti), l'utente è online
        if (strtotime($user['last_activity']) + $timeout > time()) {
            return true;
        }
    }

    return false;  // Utente non trovato o offline
}
?>