<?php
declare(strict_types=1);

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/../vendor/autoload.php";

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

/**
 * Invia email con provider configurabile.
 * Compatibilità: il parametro $useGmail mantiene il vecchio comportamento.
 */
function sendEmail(string $to, string $subject, string $body, bool $useGmail = false): void {
    $provider = env('MAIL_PROVIDER');
    if (!$provider) {
        $provider = $useGmail ? 'gmail' : 'local';
    }

    try {
        sendWithProvider($to, $subject, $body, $provider);
        return;
    } catch (Throwable $e) {
        error_log("Mail primary provider failed ($provider): " . $e->getMessage());
    }

    // fallback automatico su provider locale
    if ($provider !== 'local') {
        try {
            sendWithProvider($to, $subject, $body, 'local');
            return;
        } catch (Throwable $e) {
            error_log("Mail local fallback failed: " . $e->getMessage());
        }
    }

    throw new Exception("Invio email fallito su tutti i provider configurati.");
}

function sendWithProvider(string $to, string $subject, string $body, string $provider): void {
    if ($provider === 'mailhog') {
        $provider = 'local';
    }

    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->CharSet = 'UTF-8';
    $mail->Timeout = 15;
    $mail->SMTPDebug = 0;

    if ($provider === 'gmail') {
        $mail->Host = (string)env('MAIL_HOST_GMAIL', 'smtp.gmail.com');
        $mail->SMTPAuth = true;
        $mail->Username = (string)env('MAIL_USER_GMAIL');
        $mail->Password = (string)env('MAIL_APP_PASS_GMAIL');
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port = (int)env('MAIL_PORT_GMAIL', 587);
        $mail->setFrom((string)env('MAIL_FROM_GMAIL'), (string)env('MAIL_FROM_NAME_GMAIL'));
        if ($mail->Username === '' || $mail->Password === '') {
            throw new Exception("MAIL_GMAIL_CREDENTIALS_MISSING");
        }
    } else {
        $mail->Host = (string)env('MAIL_HOST_LOCAL', 'localhost');
        $mail->SMTPAuth = false;
        $mail->Port = (int)env('MAIL_PORT_LOCAL', 1025);
        $mail->setFrom((string)env('MAIL_FROM_LOCAL'), (string)env('MAIL_FROM_NAME_LOCAL'));
    }

    if ($mail->Host === '') {
        throw new Exception("MAIL_HOST_MISSING");
    }

    $mail->addAddress($to);
    $mail->isHTML(true);
    $mail->Subject = $subject;
    $mail->Body = $body;
    $mail->AltBody = html_entity_decode(strip_tags(str_replace(["<br>", "<br/>", "<br />"], "\n", $body)));
    $mail->send();
}
