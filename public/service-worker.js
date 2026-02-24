const CACHE_NAME = "coscenza-game-cache-v6";
const FILES_TO_CACHE = [
  // Main files
  "/index/index.html",
  "/index/index.css",
  "/index/index.js",

  // Manifest and icons
  "manifest.json",
  "/icons/android-chrome-192x192.png",
  "/icons/android-chrome-512x512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-16x16.png",
  "/icons/favicon-32x32.png",
  "/icons/favicon.ico",

  // Sounds
  "/sounds/alert.mp3",
  "/sounds/warning.mp3",

  // Preload
  "./preload.js",

  //reset password
  "/reset/reset_password.html",
  "/reset/reset.css",

  // Register
  "/register/register.html",
  "/register/register.css",
  "/register/register.js",

  // User
  "/user/user_dashboard.html",
  "/user/user_dashboard.css",
  "/user/user_dashboard.js",

  // Login
  "/login/login.html",
  "/login/login.css",
  "/login/login.js",

  // Backgrounds / Sfondi
  "/sfondi/schermata_home.jpg",
  "/sfondi/login-background.jpg",
  "/sfondi/icona_gioco.jpg",
  "/sfondi/La_Coscienza_Esterna.png",

  // Auth 2FA
  "/auth/2fa.html",
  "/auth/2fa.css",
  "/auth/2fa.js",

  // Admin
  "/admin/admin_dashboard.css",
  "/admin/admin_dashboard.js",

  //INIZIO GIOCO

    // Offline fallback
    "/gameOffline/offline.html",
    "/gameOffline/offline.css",
    "/gameOffline/main.js",
    "/gameOffline/intro.mp3",

    // Storia iniziale
    "/game/start/inizio_storia.html",
    "/game/start/inizio_storia.css",
    "/game/start/main.js",
    "/game/start/intro.mp3",

    // Personaggi gioco
    "/game/Personaggi_Gioco/Attack_1.png",
    "/game/Personaggi_Gioco/Attack_2.png",
    "/game/Personaggi_Gioco/Attack_3.png",
    "/game/Personaggi_Gioco/AttackBack_1.png",
    "/game/Personaggi_Gioco/AttackBack_2.png",
    "/game/Personaggi_Gioco/AttackBack_3.png",
    "/game/Personaggi_Gioco/Dead.png",
    "/game/Personaggi_Gioco/Hurt.png",
    "/game/Personaggi_Gioco/RunBack.png",
    "/game/Personaggi_Gioco/Shield.png",
    "/game/Personaggi_Gioco/Idle.png",
    "/game/Personaggi_Gioco/Run.png",
    "/game/Personaggi_Gioco/JumpBack.png",
    "/game/Personaggi_Gioco/Jump.png",

    // Livelli gioco
      // Livello 0
      "/game/livello0/livello_0.html",
      "/game/livello0/livello_0.css",

      //sounds
      "/game/livello0/sounds/musica_sfondo.mp3",

      // JS
      "/game/livello0/js/main.js",
      "/game/livello0/js/player.js",
      "/game/livello0/js/monster.js",
      "/game/livello0/js/secondmonster.js",
      "/game/livello0/js/xp_system.js",

      // Immagini
      "/game/livello0/img/cursore.png",
      "/game/livello0/img/gameOver.png",
      "/game/livello0/img/livello0.png",

      //cuori
      "/game/livello0/CuoriGioco/0cuori.png",
      "/game/livello0/CuoriGioco/1cuore.png",
      "/game/livello0/CuoriGioco/2cuori.png",
      "/game/livello0/CuoriGioco/3cuori.png",

      //primo mostro
      "/game/livello0/Primo_Mostro/Attack_1.png",
      "/game/livello0/Primo_Mostro/Attack_2.png",
      "/game/livello0/Primo_Mostro/Attack_3.png",
      "/game/livello0/Primo_Mostro/Dead.png",
      "/game/livello0/Primo_Mostro/Idle.png",
      "/game/livello0/Primo_Mostro/Run.png",
      "/game/livello0/Primo_Mostro/Walk.png",

      //secondo mostro
      "/game/livello0/Secondo_Mostro/Attack_1.png",
      "/game/livello0/Secondo_Mostro/Attack_2.png",
      "/game/livello0/Secondo_Mostro/Attack_3.png",
      "/game/livello0/Secondo_Mostro/Dead.png",
      "/game/livello0/Secondo_Mostro/Idle.png",
      "/game/livello0/Secondo_Mostro/Run.png",
      "/game/livello0/Secondo_Mostro/Walk.png",

    // Livello 1
    "/game/livello1/livello1.html",
    "/game/livello1/livello1.css",

      //sounds
      "/game/livello1/sounds/musica_sfondo.mp3",

      // JS
      "/game/livello1/js/main.js",
      "/game/livello1/js/player.js",
      "/game/livello1/js/monster.js",
      "/game/livello1/js/secondMonster.js",

      // Immagini
      "/game/livello1/img/cursore.png",
      "/game/livello1/img/gameOver.png",
      "/game/livello1/img/livello1.png",

      //cuori
      "/game/livello1/CuoriGioco/0cuori.png",
      "/game/livello1/CuoriGioco/1cuore.png",
      "/game/livello1/CuoriGioco/2cuori.png",
      "/game/livello1/CuoriGioco/3cuori.png",

      //primo mostro
      "/game/livello1/Primo_Mostro/Attack_1.png",
      "/game/livello1/Primo_Mostro/Attack_2.png",
      "/game/livello1/Primo_Mostro/Attack_3.png",
      "/game/livello1/Primo_Mostro/Dead.png",
      "/game/livello1/Primo_Mostro/Idle.png",
      "/game/livello1/Primo_Mostro/Run.png",
      "/game/livello1/Primo_Mostro/Walk.png",

      //secondo mostro
      "/game/livello1/Secondo_Mostro/Attack_1.png",
      "/game/livello1/Secondo_Mostro/Attack_2.png",
      "/game/livello1/Secondo_Mostro/Attack_3.png",
      "/game/livello1/Secondo_Mostro/Dead.png",
      "/game/livello1/Secondo_Mostro/Idle.png",
      "/game/livello1/Secondo_Mostro/Run.png",
      "/game/livello1/Secondo_Mostro/Walk.png",

    // Livello 2
    "/game/livello2/livello2.html",
    "/game/livello2/livello2.css",

      //sounds
      "/game/livello2/sounds/musica_sfondo.mp3",

      // JS
      "/game/livello2/js/main.js",
      "/game/livello2/js/player.js",
      "/game/livello2/js/monster.js",
      "/game/livello2/js/secondmonster.js",

      // Immagini
      "/game/livello2/img/cursore.png",
      "/game/livello2/img/gameOver.png",
      "/game/livello2/img/livello2.png",

      //cuori
      "/game/livello2/CuoriGioco/0cuori.png",
      "/game/livello2/CuoriGioco/1cuore.png",
      "/game/livello2/CuoriGioco/2cuori.png",
      "/game/livello2/CuoriGioco/3cuori.png",

      //primo mostro
      "/game/livello2/Primo_Mostro/Attack_1.png",
      "/game/livello2/Primo_Mostro/Attack_2.png",
      "/game/livello2/Primo_Mostro/Attack_3.png",
      "/game/livello2/Primo_Mostro/Dead.png",
      "/game/livello2/Primo_Mostro/Idle.png",
      "/game/livello2/Primo_Mostro/Run.png",
      "/game/livello2/Primo_Mostro/Walk.png",

      //secondo mostro
      "/game/livello2/Secondo_Mostro/Attack_1.png",
      "/game/livello2/Secondo_Mostro/Attack_2.png",
      "/game/livello2/Secondo_Mostro/Attack_3.png",
      "/game/livello2/Secondo_Mostro/Dead.png",
      "/game/livello2/Secondo_Mostro/Idle.png",
      "/game/livello2/Secondo_Mostro/Run.png",
      "/game/livello2/Secondo_Mostro/Walk.png",

    // Livello 3
    "/game/livello3/livello3.html",
    "/game/livello3/livello3.css",

      //js
      "/game/livello3/js/livello3.js",

      // Immagini
      "/game/livello3/img/cursore.png",
      "/game/livello3/img/gameOver.png",
      "/game/livello3/img/livello3.png",

  // FINE GIOCO

  // Service Worker itself
  "service-worker.js",
];

// INSTALL
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache, adding files...');

        // Log per ogni file che stiamo cercando di aggiungere
        const filePromises = FILES_TO_CACHE.map(file => {
          console.log(`Attempting to add file: ${file}`);
          return fetch(file)
            .then(response => {
              if (response.ok) {
                console.log(`File found and added: ${file}`);
                return cache.add(file);
              } else {
                console.error(`File not found (404): ${file}`);
              }
            })
            .catch(err => {
              console.error(`Error fetching file: ${file}`, err);
            });
        });

        // Aspettiamo che tutti i file siano aggiunti
        return Promise.all(filePromises)
          .then(() => {
            console.log("Files added to cache successfully");
          })
          .catch(err => {
            console.error("Error adding files to cache", err);
          });
      })
  );
  self.skipWaiting();
});

// FETCH — Cache first + offline fallback
self.addEventListener("fetch", event => {
  const requestURL = new URL(event.request.url);

  // Ignora tutto tranne http(s)
  if (!requestURL.protocol.startsWith("http")) return;

  // IGNORA TUTTE LE CHIAMATE AL BACKEND (localhost:8000)
  if (requestURL.origin === "http://localhost:8000") {
    return; // lascialo passare direttamente al network
  }

  // Se è POST (ma non verso backend), fallback offline
  if (event.request.method === "POST") {
    event.respondWith(
      fetch(event.request).catch(() => {
        if (event.request.destination === "document") {
          return caches.match("/gameOffline/offline.html");
        }
      })
    );
    return;
  }

  // GET requests — cache first, fallback offline
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type === "basic") {
            // Clone BEFORE using the response
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          return cached || (event.request.destination === "document" ? caches.match("/gameOffline/offline.html") : undefined);
        });
      return cached || fetchPromise;
    })
  );
});

// ACTIVATE
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null)
      )
    )
  );
  self.clients.claim();
});

// PUSH Notifications
self.addEventListener('push', event => {
  const data = event.data ? event.data.text() : 'No payload';
  const options = {
    body: data,
    icon: '/icons/android-chrome-192x192.png',
    badge: '/icons/android-chrome-192x192.png',
  };
  event.waitUntil(self.registration.showNotification('La Coscienza Esterna', options));
});

// Notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});

// Background sync
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(console.log('Syncing data in the background...'));
  }
});
