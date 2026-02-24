<?php
declare(strict_types=1);

/* ===============================
   SECURITY → SEVERITY MAP
=============================== */
function security_severity(string $event): string
{
    return match ($event) {

        // 🔴 CRITICI
        'brute_force',
        'sql_injection',
        'xss_attempt',
        'privilege_escalation',
        'account_takeover',
        'ip_banned',
        'user_banned'          => 'critical',

        // 🟠 WARNING
        'failed_login',
        '2fa_required',
        'suspicious_activity' => 'warning',

        // 🟢 INFO
        'user_login',
        'user_logout',
        'password_changed'    => 'info',

        default               => 'info'
    };
}

/* ===============================
   SECURITY → LABEL UI (TABELLARE)
=============================== */
function security_label(string $event): string
{
    return match ($event) {
        'failed_login'          => 'Tentativo login fallito',
        'brute_force'           => '🚨 Brute Force',
        'sql_injection'         => '🛡️ SQL Injection',
        'xss_attempt'           => '🧪 XSS',
        'privilege_escalation'  => '🧨 Privilege Escalation',
        'account_takeover'      => '🧬 Account Takeover',
        'user_login'            => 'Login utente',
        '2fa_required'          => 'Richiesta 2FA',
        'ip_banned'             => '🚫 IP Bannato',
        'user_banned'           => '🚫 Utente Bannato',
        default                 => ucfirst(str_replace('_', ' ', $event))
    };
}

/* ===============================
   SECURITY → MESSAGE (TOAST / WS)
=============================== */
function security_message(string $event): string
{
    return match ($event) {
        'failed_login'         => 'Tentativo di login fallito',
        'brute_force'          => '🚨 Brute force rilevato',
        'sql_injection'        => '🛡️ Tentativo SQL Injection',
        'xss_attempt'          => '🧪 Tentativo XSS',
        'privilege_escalation' => '🧨 Tentativo di escalation privilegi',
        'account_takeover'     => '🚨 Account takeover rilevato',
        'ip_banned'            => '🚫 IP bannato',
        'user_banned'          => '🚫 Utente bannato',
        default                => ucfirst(str_replace('_', ' ', $event))
    };
}