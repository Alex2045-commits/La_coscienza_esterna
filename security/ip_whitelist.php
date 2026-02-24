<?php
function is_ip_whitelisted(string $ip): bool {

    $whitelist = [
        '127.0.0.1',
        '::1',
        'YOUR_PUBLIC_IP_HERE'
    ];

    return in_array($ip, $whitelist, true);
}
?>