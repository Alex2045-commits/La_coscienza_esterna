# La Coscienza Esterna

Piattaforma di gioco web full-stack incentrata sulla sicurezza, con autenticazione rafforzata (sessione, JWT, 2FA), ruoli utente/amministratore, avvisi di sicurezza in tempo reale e progressione di gioco interattiva.

Sviluppata per dimostrare un'integrazione sicura tra backend e frontend, scelte di progettazione dell'autenticazione e una struttura di progetto orientata alla produzione.

## Quick Start (Local)

1. Copia `.env.example` in `.env`.
2. Configura variabili DB e segreti in `.env`.
3. Installa dipendenze:
   `npm install`
4. Avvia il server:
   `node server.js`
5. Apri:
   `http://localhost:4000/login/login.html`
   (o la porta mostrata in console).

## Per aziende/reviewer

- Il repository e pensato per essere clonato e provato rapidamente.
- Il file `.env` non va versionato (gia ignorato da `.gitignore`).
- Se vuoi una demo pubblica, pubblica anche un ambiente online con credenziali demo a privilegi ridotti.

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

## License

MIT. Vedi [LICENSE](./LICENSE).
