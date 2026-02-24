<?php
declare(strict_types=1);

require_once __DIR__ . "/../api/user/auth_middleware.php";
require_once __DIR__ . "/../api/csrf.php";

startUserSession();
$user = auth_require_user();
if (empty($user['id']) || empty($user['username'])) {
    header("Location: /login/login.html");
    exit;
}

$csrfToken = $_SESSION['csrf_token'] ?? '';
if ($csrfToken) {
    setcookie('csrf_token', $csrfToken, [
        'path' => '/',
        'httponly' => false,
        'samesite' => 'Lax',
    ]);
}

header("Content-Type: text/html; charset=utf-8");
?>
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dashboard - La Coscienza Esterna</title>
  <meta name="csrf-token" content="<?= htmlspecialchars($csrfToken) ?>">
  <link rel="stylesheet" href="http://localhost:4000/user/user_dashboard.css">
  <link rel="manifest" href="http://localhost:4000/manifest.json">
  <link rel="icon" href="http://localhost:4000/icons/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="http://localhost:4000/icons/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="http://localhost:4000/icons/favicon-16x16.png">
  <link rel="apple-touch-icon" href="http://localhost:4000/icons/apple-touch-icon.png">
</head>
<body>
<div id="app">
  <aside id="sidebar" class="">
    <div class="brand">LCE</div>
    <nav class="menu">
      <button id="menuHome" class="menu-item active">Home</button>
      <button id="menuProfile" class="menu-item">Profilo</button>
      <button id="menuNotifications" class="menu-item">Notifiche</button>
      <div class="spacer"></div>
    </nav>
  </aside>

  <main id="main">
    <header class="topbar">
      <div class="title">La Coscienza Esterna - Player Dashboard</div>
      <div style="margin-left:auto">
        <span id="coins" class="badge">Coins: 0</span>
        <button id="btnGoIndex" class="small">Home</button>
        <button id="btnStartGame" class="small">Inizia gioco</button>
        <button id="btnLogout" class="small">Logout</button>
      </div>
    </header>

    <section id="sectionHome" class="dash-section active">
      <div class="card profile-card">
        <div id="avatar" class="avatar"></div>
        <div class="profile-info">
          <h2 id="username"><?= htmlspecialchars($user['username']) ?></h2>
          <div id="roleBadge" class="badge">Player</div>
          <div id="banNotice" class="ban" style="display:none;color:#ff7b7b;margin-top:8px"></div>
        </div>
      </div>

      <div class="card">
        <h3>Avatar</h3>
        <div id="avatarList" class="avatar-list"></div>
        <div class="upload">
          <input type="file" id="avatarUpload" accept="image/png,image/jpeg">
          <button id="uploadBtn" class="small">Carica avatar</button>
          <button id="randomAvatar" class="small">Avatar casuale</button>
          <button id="saveAvatarBtn" class="small">Salva selezione</button>
        </div>
      </div>
    </section>

    <section id="sectionProfile" class="dash-section">
      <div class="card">
        <h3>Progress</h3>
        <div>Lvl <span id="level">1</span></div>
        <div id="xpBar"><div id="xpInner"></div></div>
        <div class="xp-meta">XP: <span id="xp">0</span> / <span id="xpNeeded">100</span> - next in <span id="toNext">100</span></div>
        <div class="controls">
          <button id="saveProgress" class="small">Salva inventario</button>
        </div>
      </div>

      <div class="card">
        <h3>Inventario</h3>
        <div id="inventory" class="inv"></div>
        <div class="add-item">
          <input id="newItem" placeholder="Nome item">
          <button id="addItem" class="small">Aggiungi</button>
        </div>
      </div>

    </section>

    <section id="sectionNotifications" class="dash-section">
      <div class="card notifications-card">
        <h3>Notifiche</h3>
        <div class="notifications-toolbar">
          <div id="notificationsInfo">Pagina 1/1 · Totale 0</div>
          <div class="notifications-actions">
            <button id="notifPrev" class="small" type="button">Precedente</button>
            <button id="notifNext" class="small" type="button">Successiva</button>
          </div>
        </div>
        <div class="notifications-table-wrap">
          <table class="notifications-table">
            <thead>
              <tr>
                <th>Messaggio</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody id="notificationsTableBody"></tbody>
          </table>
        </div>
      </div>
    </section>
  </main>
</div>

<div id="toastContainer"></div>
<script src="http://localhost:4000/auth.js"></script>
<script src="http://localhost:4000/user/user_dashboard.js"></script>
</body>
</html>
