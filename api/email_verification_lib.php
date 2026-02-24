<?php
declare(strict_types=1);

function ensureEmailVerificationTable(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS email_verifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            email VARCHAR(255) NOT NULL,
            code_hash VARCHAR(255) NULL,
            expires_at DATETIME NULL,
            attempts INT NOT NULL DEFAULT 0,
            verified_at DATETIME NULL,
            last_sent_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

function issueEmailVerificationCode(PDO $pdo, int $userId, string $email, int $ttlSeconds = 600): string {
    $code = (string)random_int(100000, 999999);
    $codeHash = password_hash($code, PASSWORD_DEFAULT);
    $expiresAt = (new DateTimeImmutable('now'))
        ->add(new DateInterval('PT' . max(60, $ttlSeconds) . 'S'))
        ->format('Y-m-d H:i:s');

    $stmt = $pdo->prepare("
        INSERT INTO email_verifications (user_id, email, code_hash, expires_at, attempts, verified_at, last_sent_at)
        VALUES (:uid, :email, :hash, :expires_at, 0, NULL, NOW())
        ON DUPLICATE KEY UPDATE
            email = VALUES(email),
            code_hash = VALUES(code_hash),
            expires_at = VALUES(expires_at),
            attempts = 0,
            verified_at = NULL,
            last_sent_at = NOW()
    ");
    $stmt->execute([
        ':uid' => $userId,
        ':email' => $email,
        ':hash' => $codeHash,
        ':expires_at' => $expiresAt
    ]);

    return $code;
}

function getEmailVerificationRow(PDO $pdo, int $userId): ?array {
    $stmt = $pdo->prepare("
        SELECT user_id, email, code_hash, expires_at, attempts, verified_at, last_sent_at
        FROM email_verifications
        WHERE user_id = :uid
        LIMIT 1
    ");
    $stmt->execute([':uid' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function isEmailVerified(PDO $pdo, int $userId): bool {
    $row = getEmailVerificationRow($pdo, $userId);
    if (!$row) {
        // utenti legacy: nessuna riga => considerato verificato
        return true;
    }
    return !empty($row['verified_at']);
}

function canResendEmailVerification(PDO $pdo, int $userId, int $cooldownSeconds = 60): bool {
    $row = getEmailVerificationRow($pdo, $userId);
    if (!$row || empty($row['last_sent_at'])) return true;
    $last = strtotime((string)$row['last_sent_at']);
    if ($last === false) return true;
    return (time() - $last) >= max(10, $cooldownSeconds);
}

function verifyEmailCode(PDO $pdo, int $userId, string $code): array {
    $row = getEmailVerificationRow($pdo, $userId);
    if (!$row) {
        return ['ok' => false, 'error' => 'VERIFICATION_NOT_FOUND'];
    }
    if (!empty($row['verified_at'])) {
        return ['ok' => true, 'already_verified' => true];
    }

    $expiresTs = strtotime((string)$row['expires_at']);
    if ($expiresTs === false || $expiresTs < time()) {
        return ['ok' => false, 'error' => 'CODE_EXPIRED'];
    }

    $attempts = (int)($row['attempts'] ?? 0);
    if ($attempts >= 8) {
        return ['ok' => false, 'error' => 'TOO_MANY_ATTEMPTS'];
    }

    $hash = (string)($row['code_hash'] ?? '');
    $valid = $hash !== '' && password_verify($code, $hash);
    if (!$valid) {
        $upd = $pdo->prepare("UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = :uid");
        $upd->execute([':uid' => $userId]);
        return ['ok' => false, 'error' => 'INVALID_CODE'];
    }

    $ok = $pdo->prepare("
        UPDATE email_verifications
        SET verified_at = NOW(), code_hash = NULL, expires_at = NULL
        WHERE user_id = :uid
    ");
    $ok->execute([':uid' => $userId]);
    return ['ok' => true];
}
