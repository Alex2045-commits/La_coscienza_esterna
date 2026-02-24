<?php
require_once __DIR__ . '/../vendor/autoload.php';

function postJson(string $url, array $payload): array {
    $ctx = stream_context_create([
        'http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json\r\n",
            'content' => json_encode($payload),
        ]
    ]);

    $res = file_get_contents("http://localhost{$url}", false, $ctx);
    return json_decode($res, true);
}
?>