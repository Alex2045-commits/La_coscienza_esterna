<?php
declare(strict_types=1);

require_once __DIR__ . '/security_levels.php';

/* ===============================
   NOTIFY ADMIN VIA WS
=============================== */

function notify_admin_ws(array $payload): void
{
    // Evita loop WS → WS
    if (!empty($payload['from_ws'])) {
        return;
    }

    $event = $payload['event'] ?? 'unknown';

    $data = [
        'type' => 'alert',
        'alert' => [
            'id'        => $payload['log_id']   ?? null,     // 🔑 ID security_logs
            'severity'  => security_severity($event),       // 🔥 SERVER SOURCE OF TRUTH
            'event'     => $event,
            'label'     => security_label($event),          // testo leggibile
            'ip'        => $payload['ip']       ?? null,
            'user_id'   => $payload['user_id'] ?? null,
            'created_at'=> date('Y-m-d H:i:s'),

            // 🔥 AZIONI DISPONIBILI PER UI
            'actions' => [
                'ban_ip' => !empty($payload['ip']),
            ]
        ]
    ];

    @file_get_contents(
        'http://127.0.0.1:8081/notify',
        false,
        stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  => "Content-Type: application/json\r\n",
                'content' => json_encode($data, JSON_THROW_ON_ERROR),
                'timeout' => 0.25
            ]
        ])
    );
}
