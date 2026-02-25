# La Coscienza Esterna

Piattaforma web full-stack orientata alla sicurezza, con autenticazione rafforzata (sessione, JWT, 2FA), ruoli utente/amministratore, avvisi di sicurezza in tempo reale e progressione di gioco interattiva.

## Stato del progetto
Progetto in evoluzione.

## Avvio rapido
1. Clona il repository.
2. Copia `.env.example` in `.env`.
3. Configura variabili DB e segreti in `.env`.
4. Installa le dipendenze: `npm install`.
5. Avvia il server: `node server.js`.
6. Apri `http://localhost:4000/login/login.html` (o la porta mostrata in console).

## Per aziende / reviewer
- Repository pensato per essere clonato e provato rapidamente.
- Il file `.env` non va versionato (gia ignorato da `.gitignore`).
- Per una demo pubblica, usare credenziali demo con privilegi ridotti.

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
