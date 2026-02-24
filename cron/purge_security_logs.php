<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../admin/api/boostrap_local_admin.php';

$logFile = __DIR__.'/prune_security_logs.log';
file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] Inizio script\n", FILE_APPEND);

try {
    // Verifica connessione PDO
    if (!isset($pdo)) {
        throw new Exception("PDO non inizializzato");
    }

    // Aggiungi il log dell'ora del server
    file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] Ora del server UTC: ".date('Y-m-d H:i:s', time())."\n", FILE_APPEND);

    // Calcola la data di inizio del mese corrente
    $currentMonthStart = date('Y-m-01 00:00:00');  // Primo giorno del mese corrente
    $previousMonthEnd = date('Y-m-t', strtotime('last month'));  // Ultimo giorno del mese precedente
    $previousMonthEnd2DaysBefore = date('Y-m-d', strtotime('-2 days', strtotime($previousMonthEnd)));  // Due giorni prima della fine del mese precedente

    // Log delle date di interesse
    file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] Inizio mese corrente: $currentMonthStart\n", FILE_APPEND);
    file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] Ultimo giorno mese precedente: $previousMonthEnd\n", FILE_APPEND);
    file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] Due giorni prima della fine mese precedente: $previousMonthEnd2DaysBefore\n", FILE_APPEND);

    // Controlla quante righe devono essere eliminate (tutte quelle prima dell'inizio del mese corrente tranne gli ultimi due giorni del mese precedente)
    $stmt = $pdo->prepare("SELECT COUNT(*) AS count 
                            FROM security_logs 
                            WHERE created_at < :startOfMonth 
                            AND created_at < :excludeLast2DaysBefore");
    $stmt->bindParam(':startOfMonth', $currentMonthStart);
    $stmt->bindParam(':excludeLast2DaysBefore', $previousMonthEnd2DaysBefore);
    $stmt->execute();
    $row = $stmt->fetch();
    $countBefore = $row['count'];
    file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] Numero righe da eliminare: $countBefore\n", FILE_APPEND);

    // Esegui la query DELETE
    $stmtDelete = $pdo->prepare("DELETE FROM security_logs 
                                 WHERE created_at < :startOfMonth 
                                 AND created_at < :excludeLast2DaysBefore");
    $stmtDelete->bindParam(':startOfMonth', $currentMonthStart);
    $stmtDelete->bindParam(':excludeLast2DaysBefore', $previousMonthEnd2DaysBefore);
    $stmtDelete->execute();

    // Ottieni il numero di righe eliminate
    $deleted = $stmtDelete->rowCount();

    // Log del risultato della query DELETE
    file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] Righe eliminate: $deleted\n", FILE_APPEND);

    // Step 1: Sovrascrivi gli ID dei record rimanenti in ordine crescente
    $stmtUpdateIds = $pdo->prepare("SET @new_id = 0;");
    $stmtUpdateIds->execute();
    
    $stmtReassignIds = $pdo->prepare("UPDATE security_logs 
                                      SET id = (@new_id := @new_id + 1) 
                                      WHERE created_at >= :startOfMonth 
                                      ORDER BY created_at");
    $stmtReassignIds->bindParam(':startOfMonth', $currentMonthStart);
    $stmtReassignIds->execute();

    file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] ID re-assegnati con successo.\n", FILE_APPEND);

    // Step 2: Impostare l'auto_increment al valore successivo (MAX(id) + 1)
    $stmtMaxId = $pdo->prepare("SELECT MAX(id) AS max_id FROM security_logs");
    $stmtMaxId->execute();
    $rowMaxId = $stmtMaxId->fetch();
    $maxId = $rowMaxId['max_id'];

    if ($maxId !== null) {
        $nextAutoIncrement = $maxId + 1;
        $stmtResetAutoIncrement = $pdo->prepare("ALTER TABLE security_logs AUTO_INCREMENT = :nextAutoIncrement");
        $stmtResetAutoIncrement->bindParam(':nextAutoIncrement', $nextAutoIncrement, PDO::PARAM_INT);
        $stmtResetAutoIncrement->execute();
        file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] Auto_INCREMENT resettato a: $nextAutoIncrement\n", FILE_APPEND);
    }

    // Controlla se ci sono record dopo la cancellazione
    $stmt->execute();
    $row = $stmt->fetch();
    $countAfter = $row['count'];
    file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] Numero righe dopo eliminazione: $countAfter\n", FILE_APPEND);

} catch (PDOException $e) {
    file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] Errore PDO: ".$e->getMessage()."\n", FILE_APPEND);
} catch (Exception $e) {
    file_put_contents($logFile, "[".date('Y-m-d H:i:s')."] Errore: ".$e->getMessage()."\n", FILE_APPEND);
}
