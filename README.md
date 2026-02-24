# La Coscienza Esterna

Piattaforma di gioco web full-stack incentrata sulla sicurezza, con autenticazione rafforzata (sessione, JWT, 2FA), ruoli utente/amministratore, avvisi di sicurezza in tempo reale e progressione di gioco interattiva.

Sviluppata per dimostrare un'integrazione sicura tra backend e frontend, scelte di progettazione dell'autenticazione e una struttura di progetto orientata alla produzione.

## Perché questo progetto?
Questo progetto è stato creato per andare oltre gli esercizi scolastici ed
approfondire le mie competenze. Mi sono focalizzato in particolare su:
- autenticazioni reali basate su cookie
- sicurezza lato server e progettazione web
- comunicazione full-stack (API, database, frontend)

## Cosa ho imparato
- come funzionano i flussi di autenticazione (sessioni vs JWT)
- basi di sicurezza lato backend
- struttura di un progetto full-stack
- debugging e miglioramento del codice

## Stato del progetto
Progetto nato a scopo di studio e sperimentazione, attualmente in continua evoluzione.

## Avvio rapido
1. Clona il repository
2. Configura le variabili d’ambiente
3. Avvia backend e frontend.

## Come avviare la parte backend e frontend

1. Copia `.env.example` in `.env`.
2. Configura variabili DB e segreti in `.env`.
3. Installa dipendenze:
   `npm install`
4. Avvia il server:
   `node server.js`
5. Apri:
   `http://localhost:4000/login/login.html`
   (o la porta mostrata in console).

## Per aziende / reviewer

- Il repository è pensato per essere clonato e provato rapidamente.
- Il file `.env` non va versionato (già ignorato da `.gitignore`).
- Per una demo pubblica, è consigliato usare credenziali demo con privilegi ridotti.

## Configurazione login/2FA

- In sviluppo locale:
  - `APP_ENV=dev`
  - opzionale `SKIP_2FA_IN_DEV=1` solo per test locale
- In produzione:
  - `APP_ENV=prod`
  - `SKIP_2FA_IN_DEV=0`
  - HTTPS obbligatorio e cookie sicuri

## Sicurezza minima prima del deploy

1. Rigenera segreti (`JWT_SECRET`, `PASSWORD_PEPPER`).
2. Verifica che non ci siano URL hardcoded `localhost` nei flussi critici.
3. Usa account demo separati da account reali.

## Nota personale
Non è un progetto perfetto, ma mi è servito per capire come funziona davvero un’applicazione full-stack.

## License

MIT. Vedi [LICENSE](./LICENSE).
