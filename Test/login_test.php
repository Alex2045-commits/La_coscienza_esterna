<?php
header("Content-Type: application/json; charset=utf-8");

// Simula login admin
echo json_encode(['ok'=>true,'twofa_required'=>true]);
exit;
