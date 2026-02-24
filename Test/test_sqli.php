<?php
require_once __DIR__ . '/../api/utils.php';

$tests = [
    // 🔴 HIGH RISK
    "' OR 1=1 --",
    "' UNION SELECT 1,2,3 --",
    "admin'--",
    "un/**/ion sel/**/ect",
    "u n i o n s e l e c t",
    "' OR sleep(5)--",

    // 🟢 LEGIT
    "john.doe@gmail.com",
    "marco_rossi",
    "password123!",
    "P@ssw'rd!2024",
];

foreach ($tests as $input) {
    $score = detectSqlInjection($input, false);
    printf(
        "[%s] score=%d | %s\n",
        $score >= 30 ? 'BLOCK' : 'ALLOW',
        $score,
        $input
    );
}
