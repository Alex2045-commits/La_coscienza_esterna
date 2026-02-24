// Shared narrative base for all game levels.
// Exposed as window.EOV_STORY_BIBLE so each level can reuse the same canon.
(function () {
  const characterColors = {
    narrator: "#c9d8ff",
    marco: "#f2e6c9",
    sasha: "#d8b6c9",
    austin: "#c8d7f0",
    natasha: "#b8e0d2",
    costantino: "#e3d4a8",
    laura: "#d6c9bf",
    paolo: "#cda894",
    brute: "#d9a7a7",
    antonio: "#d2b3a2"
  };

  const aliases = {
    narratore: "narrator",
    coscienza: "narrator",
    marco: "marco",
    sasha: "sasha",
    austin: "austin",
    natasha: "natasha",
    costantino: "costantino",
    laura: "laura",
    paolo: "paolo",
    bruto: "brute",
    antonio: "antonio"
  };

  function normalizeText(input) {
    return String(input || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function detectCharacterKey(text) {
    const normalized = normalizeText(text);
    const prefix = normalized.match(/^([a-z]+)\s*:/);
    if (prefix && aliases[prefix[1]]) return aliases[prefix[1]];

    for (const name of Object.keys(aliases)) {
      if (normalized.includes(name)) return aliases[name];
    }
    return null;
  }

  function getNarrativeColor(text, fallback) {
    const key = detectCharacterKey(text);
    return (key && characterColors[key]) || fallback || "#d7dbe8";
  }

  const story = {
    characterColors,
    narrator: {
      name: "Narratore - La Coscienza Esterna",
      role: "Voce onnisciente che osserva Marco senza intervenire.",
      symbol: "Consapevolezza precoce non ascoltata."
    },
    characters: {
      marco: {
        name: "Marco",
        role: "Protagonista frammentato",
        symbol: "Inerzia esistenziale e identita incompleta."
      },
      sasha: {
        name: "Sasha",
        role: "Trauma che si ripete",
        symbol: "Il dolore non guarito che viene trasmesso."
      },
      austin: {
        name: "Austin",
        role: "Maschera della forza",
        symbol: "Potere apparente, dipendenza interiore."
      },
      natasha: {
        name: "Natasha",
        role: "Controllo travestito da amore",
        symbol: "Possesso emotivo e paura della perdita."
      },
      costantino: {
        name: "Costantino",
        role: "Ideale irrealizzabile",
        symbol: "Io ideale che si allontana quando non si agisce."
      },
      brute: {
        name: "Bruto",
        role: "Il sistema che schiaccia",
        symbol: "Struttura sociale che alimenta paura e sottomissione."
      }
    },
    chapters: [
      {
        id: 1,
        title: "L'Abitudine",
        theme: "Normalizzazione del dolore",
        level: 0,
        beats: [
          "Narratore: Io osservo. Marco continua a non reagire.",
          "Ogni scelta sembra libera, ma pesa dentro senza cambiare l'evento.",
          "La passivita non e vuoto: e un rifugio che diventa prigione."
        ]
      },
      {
        id: 2,
        title: "Il Trauma che Ritorna",
        theme: "Ripetizione",
        level: 1,
        beats: [
          "Sasha non e il mostro: e una ferita che cerca forma.",
          "Ansia: corridoi stretti, fiato corto, memoria che stringe.",
          "Evitare protegge. Restare ferisce. Ma solo restando capisci."
        ]
      },
      {
        id: 3,
        title: "La Maschera",
        theme: "Falsa forza",
        level: 2,
        beats: [
          "Austin sembra dominio. In realta e controllo subito.",
          "Specchi, doppi, stanze vuote: sapere non basta ad agire.",
          "Marco vede se stesso nell'altro: coscienza senza decisione."
        ]
      },
      {
        id: 4,
        title: "Il Controllo",
        theme: "Amore che soffoca",
        level: 3,
        beats: [
          "Natasha cura e limita nello stesso gesto.",
          "Le opzioni spariscono 'per il tuo bene'.",
          "Il conforto puo diventare gabbia."
        ]
      },
      {
        id: 5,
        title: "L'Ideale",
        theme: "Io ideale vs realta",
        level: 3,
        beats: [
          "Costantino unifica imperi. Marco fatica a unire se stesso.",
          "L'ideale diventa freddo quando non c'e azione.",
          "L'illusione non crolla: svanisce."
        ]
      },
      {
        id: 6,
        title: "Il Sistema",
        theme: "Impotenza strutturale",
        level: 3,
        beats: [
          "Bruto non e solo un uomo: e il meccanismo.",
          "Debito, pressione, paura: nessuno scontro diretto.",
          "Il mondo schiaccia senza bisogno di gridare."
        ]
      },
      {
        id: 7,
        title: "Constatazione",
        theme: "Consapevolezza tardiva",
        level: 3,
        beats: [
          "I mostri non si sconfiggono: si riconoscono.",
          "Marco capisce tutto. Tardi, ma davvero.",
          "Narratore: Ora lo sai. Lo sapevi anche prima."
        ]
      }
    ]
  };

  window.EOV_STORY_BIBLE = story;
  window.EOV_getNarrativeColor = getNarrativeColor;
})();
