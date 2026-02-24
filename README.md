# La Coscienza Esterna

Security-focused full-stack web game platform featuring hardened authentication
(session, JWT, 2FA), user/admin roles, real-time security alerts and interactive
game progression.

Built to demonstrate secure backend/frontend integration, auth design choices,
and production-oriented project structure.

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
