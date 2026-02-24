<?php
declare(strict_types=1);


require_once __DIR__ . "/../api/startSecureAdminSession.php";
require_once __DIR__ . "/../api/auth_middleware.php";
require_once __DIR__ . "/../api/csrf.php";


// Avvia sessione sicura admin e genera CSRF token
startSecureAdminSession();


// Adesso il token esiste sicuramente in $_SESSION
$csrfToken = $_SESSION['csrf_token'] ?? '';

// -------------------------
// Controllo login/admin
// -------------------------
$user = [
    'id'       => $_SESSION['user_id'] ?? null,
    'username' => $_SESSION['username'] ?? null,
    'role'     => $_SESSION['role'] ?? null,
];

// -------------------------
// CORS (solo per front-end in sviluppo)
// -------------------------
$allowed_origin = "http://localhost:8000";
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === $allowed_origin) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
}

// -------------------------
// Recupero CSRF token e cookie
// -------------------------
$csrfToken = $_SESSION['csrf_token'] ?? '';
if ($csrfToken) {
    setcookie('csrf_token', $csrfToken, [
        'path' => '/',
        'httponly' => false,
        'samesite' => 'Lax',
    ]);
}

// -------------------------
// Header HTML
// -------------------------
header("Content-Type: text/html; charset=utf-8");

// -------------------------
// Connessione PDO
// -------------------------
$pdo = $GLOBALS['pdo'] ?? null;
if (!$pdo) {
    die("PDO non inizializzato");
}

// -------------------------
// Recupero Utenti + Security Score
// -------------------------
$stmtUsers = $pdo->query("
    SELECT 
        u.id,
        u.username,
        u.email,
        u.role,
        u.last_activity,
        u.last_ip,
        COALESCE(s.score, 0) AS security_score
    FROM users u
    LEFT JOIN security_ip_score s ON s.ip = u.last_ip
    ORDER BY security_score DESC, u.username ASC
");
$users = $stmtUsers->fetchAll(PDO::FETCH_ASSOC);

// Security audit
$stmtSecurity = $pdo->query("
    SELECT id, user_id, event AS action, ip, created_at
    FROM security_audit
    ORDER BY created_at DESC
    LIMIT 200
");
$securityLogs = $stmtSecurity->fetchAll(PDO::FETCH_ASSOC);
?>

<!doctype html>
<html lang="it" data-theme="contrast">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
<meta name="csrf-token" content="<?= htmlspecialchars($csrfToken) ?>">

<title>Admin Dashboard - La Coscienza Esterna</title>

<!-- FontAwesome -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

<!-- Admin CSS servito da Node -->
<link rel="stylesheet" href="http://localhost:4000/admin/admin_dashboard.css">

<!-- Favicon -->
<link rel="icon" href="http://localhost:4000/icons/favicon.ico" type="image/x-icon">

<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>

<body>
    <script>
    const SECURITY_LOGS = <?= json_encode($securityLogs) ?>;
    const SECURITY_ROWS_PER_PAGE = 11;  // massimo 11 log per pagina
    let securityCurrentPage = 1;
    </script>
    <!-- TOAST GLOBALI -->
    <div id="globalToastContainer"
       style="
          position: fixed;
          top: 20px;
          right: 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          z-index: 99999;
          pointer-events: none;
       ">
  </div>
<div id="app">
    <!-- SIDEBAR -->
    <aside id="sidebar" class="closed">
        <div class="brand">
            <div class="logo">LCE</div>
            <div class="title">Admin page</div>
            <div class="theme-switcher">
                <button class="theme-btn" data-theme="dark" aria-label="Tema scuro" title="Tema scuro">
                    <span class="theme-label" aria-hidden="true">🌙</span>
                </button>
                <button class="theme-btn" data-theme="light" aria-label="Tema chiaro" title="Tema chiaro">
                    <span class="theme-label" aria-hidden="true">☀️</span>
                </button>
                <button class="theme-btn" data-theme="contrast" aria-label="Tema contrasto" title="Tema contrasto">
                    <span class="theme-label" aria-hidden="true">◐</span>
                </button>
            </div>
        </div>

        <nav class="menu">
            <button class="menu-item active" data-section="home"><i class="fa-solid fa-house"></i><span>Home</span></button>
            <button class="menu-item" data-section="overview"><i class="fa-solid fa-gauge"></i><span>Overview</span></button>
            <button class="menu-item" data-section="users"><i class="fa-solid fa-users"></i><span>Utenti</span></button>
            <button class="menu-item" data-section="security">
                <i class="fa-solid fa-shield-halved"></i>
                <span>Security</span>
                <span id="alertBadge" class="badge hidden">0</span>
            </button>
        </nav>

        <div class="sidebar-footer">
            <div id="adminName">
                <?php if (!empty($user['username'])): ?>
                    <?= htmlspecialchars($user['username']) ?>
                <?php else: ?>
                    <h1>hai fatto logout</h1>
                <?php endif; ?>
            </div>
            <!-- Bottone Logout -->
            <button id="btnLogout" class="danger">
                <i class="fa-solid fa-right-from-bracket"></i> Logout
            </button>

            <!-- MODAL LOGOUT -->
            <div id="logoutModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="logoutTitle">
                <!-- Overlay -->
                <div class="modal-overlay"></div>

                <!-- Box del modal -->
                <div class="modal-box">
                <h3 id="logoutTitle">Conferma logout</h3>
                <p>Sei sicuro di voler uscire dall'area admin?</p>

                <div class="modal-actions">
                    <button id="cancelLogout" class="ghost">Annulla</button>
                    <button id="confirmLogout" class="danger">Logout</button>
                </div>
                </div>
            </div>
        </div>
    </aside>

    <!-- MAIN -->
    <main id="main">
        <div class="topbar">
            <button id="sidebarToggle" class="ghost" aria-label="Apri menu">
                <i class="fa-solid fa-bars" aria-hidden="true"></i>
            </button>
            <button id="btnStartGameAdmin" class="ghost" style="margin-left:auto;">
                <i class="fa-solid fa-gamepad" aria-hidden="true"></i> Lato Player Admin
            </button>
        </div>

        <!-- HOME -->
        <section id="section-home" class="section active">
            <h2>Benvenuto Admin</h2>
            <div class="cards">
                <div class="card stat"><div class="lbl">Utenti</div><div class="val" id="statTotalUsersHome">-</div></div>
                <div class="card stat"><div class="lbl">Security Alerts</div><div class="val" id="statSecurityAlertsHome">0</div></div>
            </div>
            <div class="panel admin-notifications">
                <div class="admin-notif-head">
                    <h3>Notifiche Sicurezza Essenziali</h3>
                    <label for="notifLimit">Mostra</label>
                    <select id="notifLimit">
                        <option value="10" selected>10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                    </select>
                </div>
                <div class="admin-notif-table-wrap">
                    <table class="admin-notif-table">
                        <thead>
                            <tr>
                                <th>Evento</th>
                                <th>IP</th>
                                <th>Data</th>
                            </tr>
                        </thead>
                        <tbody id="notifTable"></tbody>
                    </table>
                </div>
            </div>
        </section>

        <!-- OVERVIEW -->
        <section id="section-overview" class="section">
            <h2>Overview</h2>
            <div class="cards">
                <div class="card stat"><div class="lbl">Totali</div><div class="val" id="statTotalUsers">-</div></div>
                <div class="card stat"><div class="lbl">Online Ora</div><div class="val" id="statActiveUsers">-</div></div>
                <div class="card stat"><div class="lbl">Eliminati</div><div class="val" id="statDeletedUsers">-</div></div>
                <div class="card stat"><div class="lbl">Security Alerts</div><div class="val" id="statSecurityAlertsOverview">0</div></div>
            </div>

            <div class="charts">
                <canvas id="chartUsers"></canvas>
                <canvas id="chartLogs"></canvas>
            </div>
        </section>

        <!-- UTENTI -->
        <section id="section-users" class="section">
            <h2>Utenti</h2>
            <div class="panel table-wrap">
                <!-- Filtri ricerca -->
                <div class="search-filters">
                    <input type="text" id="search" placeholder="Cerca utente..." class="search-input">
                    <select id="role" class="search-select">
                        <option value="">Tutti i ruoli</option>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Security Score</th>
                            <th>Last Activity</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody id="tab">
                        <!-- Dati caricati dinamicamente dal JS -->
                    </tbody>
                </table>
            </div>
        </section>

        <!-- SECURITY -->
        <section id="section-security" class="section">
            <div class="panel security-test-panel">
                <h3>Security Test (Admin)</h3>
                <p class="security-test-hint">
                    Esegue test controllati su SQL injection e anti-cheat senza usare la console.
                </p>
                <div class="security-test-actions">
                    <button id="btnTestSqliAdmin" class="ghost warning" type="button">Test SQLi Admin API</button>
                    <button id="btnTestSqliUser" class="ghost warning" type="button">Test SQLi User API</button>
                    <button id="btnTestXssUser" class="ghost warning" type="button">Test XSS API</button>
                    <button id="btnTestLfiUser" class="ghost warning" type="button">Test LFI API</button>
                    <button id="btnTestRceUser" class="ghost warning" type="button">Test RCE API</button>
                    <button id="btnTestAntiCheat" class="ghost danger" type="button">Test Anti-Cheat XP</button>
                    <button id="btnClearSecurityTestLog" class="ghost" type="button">Pulisci log test</button>
                </div>
                <div id="securityTestOutput" class="security-test-output" aria-live="polite"></div>
            </div>

            <div class="security-grid panel">
                <div class="table-container">
                    <div id="securityPagination">
                        <div class="pagination-left">
                            <button id="securityPrevBtn">Prev</button>
                            <span id="securityPageInfo"></span>
                            <button id="securityNextBtn">Next</button>
                        </div>

                        <div class="jump-to-page">
                            <label for="pageInput">Vai a pagina:</label>
                            <input type="number" id="pageInput" min="1" placeholder="1" />
                            <button id="selectPage">Vai</button>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th scope="col">Dot</th>
                                <th scope="col">User</th>
                                <th scope="col">Evento</th>
                                <th scope="col">IP</th>
                                <th scope="col">Data</th>
                                <th scope="col">Azioni</th>
                            </tr>
                        </thead>
                        <tbody id="securityAudit"></tbody>
                    </table>
                </div>
                <div class="chart-container">                   
                    <button id="btnDownloadSecurityChart" class="ghost export-btn">
                        Scarica grafico
                    </button>
                    <canvas id="chartSecurity"></canvas>
                </div>
            </div>
        </section>
    </main>
</div>

<div id="overlay"></div>

<!-- Scripts serviti da Node -->
<script type="module" charset="utf-8" src="http://localhost:4000/admin/admin_dashboard.js"></script>

<!-- Audio servito da Node -->
<audio id="soundAlert" src="http://localhost:4000/sounds/alert.mp3" preload="auto"></audio>
<audio id="soundWarning" src="http://localhost:4000/sounds/warning.mp3" preload="auto"></audio>

</body>
</html>

