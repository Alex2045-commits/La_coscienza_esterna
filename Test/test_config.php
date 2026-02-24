<?php
require_once __DIR__ . '/../api/config.php';

echo "CONFIG CARICATO OK<br>";
echo "PDO: ";
var_dump(isset($GLOBALS['pdo']));
?>