<?php

function security_severity(string $event): string {
    $e = strtolower($event);

    return match (true) {
        str_contains($e, 'brute')  => 'critical',
        str_contains($e, 'ban')    => 'critical',
        str_contains($e, 'attack')=> 'critical',

        str_contains($e, 'failed') => 'warning',
        str_contains($e, '2fa')    => 'warning',

        default                    => 'info',
    };
}
?>