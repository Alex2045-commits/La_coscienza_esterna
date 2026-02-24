//preload.js
window.addEventListener("DOMContentLoaded", () => {
  console.log("Preload: DOM pronto!");

  // Nasconde il preloader quando la pagina è pronta
  const preLoader = document.getElementById('preLoader');
  if (preLoader) {
    preLoader.classList.add('hidden');  // aggiungi classe CSS 'hidden'
  }

  // Rimuove la classe 'loading' dal body per mostrare il contenuto
  document.body.classList.remove('loading');

  // Registra il Service Worker per offline
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => console.log("Service Worker registrato"))
      .catch(err => console.error("Errore registrazione SW:", err));
  }
});