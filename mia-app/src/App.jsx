import { useState, useEffect, useRef } from "react";

const ANNO_CORRENTE = new Date().getFullYear();

// ---------- monetizzazione ----------
const LINK_PAGAMENTO = "https://buy.stripe.com/IL-TUO-LINK";
const PREZZO = "9,99 €/anno";
const LIMITE_FREE = 10; 

const codiceValido = (c) => {
  const s = String(c).trim().toUpperCase();
  if (!/^SOGLIA-[A-Z0-9]{6}$/.test(s)) return false;
  let somma = 0;
  for (const ch of s) somma += ch.charCodeAt(0);
  return somma % 97 === 31;
};

const eur = (n) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);

const T = {
  fondo: "#14171C", pannello: "#1C2026", linea: "#2A2F37",
  testo: "#EAE8E3", muto: "#969DA8", oro: "#C9A24B",
  rosso: "#C25B5B", verde: "#5BA37C",
};
const stIn = {
  width: "100%", boxSizing: "border-box", background: T.fondo,
  border: `1px solid ${T.linea}`, color: T.testo, borderRadius: 8,
  padding: "9px 12px", fontSize: 14,
};
const stCard = {
  background: T.pannello, border: `1px solid ${T.linea}`,
  borderRadius: 12, padding: 18, marginBottom: 16,
};
const stBtn = (p) => ({
  borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700,
  background: p ? T.oro : T.fondo, color: p ? "#14171C" : T.testo,
  border: p ? "none" : `1px solid ${T.linea}`, cursor: "pointer",
});
const Et = ({ c }) => (
  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: T.oro, margin: "0 0 12px" }}>{c}</p>
);

// ---------- validazione ----------
const validaImporto = (s) => {
  const pulito = String(s).trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(pulito)) return null; 
  const n = parseFloat(pulito);
  return n > 0 && n <= 100000 ? Math.round(n * 100) / 100 : null;
};
const validaData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
const pulisciTesto = (s, max) =>
  String(s).replace(/[<>"]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const dataIT = (iso) => iso.split("-").reverse().join("/");

// ---------- persistenza ----------
const leggi = async (k, fallback) => {
  try {
    const r = await window.storage.get(k);
    return r && r.value ? JSON.parse(r.value) : fallback;
  } catch (e) { return fallback; }
};
const scrivi = async (k, v) => {
  try { await window.storage.set(k, JSON.stringify(v)); return true; }
  catch (e) { return false; }
};

const scaricaFile = (nome, contenuto, tipo) => {
  const blob = new Blob([contenuto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function SogliaPro() {
  const [anno, setAnno] = useState(ANNO_CORRENTE);
  const [archivio, setArchivio] = useState({}); 
  const [conf, setConf] = useState({ cap: 5000, bollo: 77.47 });
  const [f, setF] = useState({ cliente: "", data: new Date().toISOString().slice(0, 10), lordo: "", ritenuta: true, descr: "" });
  const [msg, setMsg] = useState("");
  const [vista, setVista] = useState("registro"); 
  const [stampaR, setStampaR] = useState(null);
  const [pro, setPro] = useState(false);
  const [codice, setCodice] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    leggi("sogliapro:archivio", {}).then(setArchivio);
    leggi("sogliapro:conf", { cap: 5000, bollo: 77.47 }).then(setConf);
    leggi("sogliapro:pro", false).then((v) => setPro(v === true));
  }, []);

  const attivaPro = () => {
    if (codiceValido(codice)) {
      setPro(true);
      scrivi("sogliapro:pro", true);
      setCodice("");
      setMsg("Soglia Pro attivato su questo dispositivo. Grazie!");
    } else {
      setMsg("Codice non valido: controlla maiuscole e trattino (formato SOGLIA-XXXXXX).");
    }
  };

  const lista = archivio[anno] || [];
  const tot = lista.reduce((s, r) => s + r.lordo, 0);

  const capNum = parseFloat(String(conf.cap).replace(",", ".")) || 5000;
  const bolloNum = parseFloat(String(conf.bollo).replace(",", ".")) || 77.47;

  const pct = Math.min(100, (tot / capNum) * 100);
  const calc = (lordo, rit) => {
    const r = rit ? Math.round(lordo * 20) / 100 : 0;
    return { rit: r, netto: Math.round((lordo - r) * 100) / 100 };
  };

  const salvaArchivio = (nuovo) => { setArchivio(nuovo); scrivi("sogliapro:archivio", nuovo); };

  const aggiungi = () => {
    if (!pro && lista.length >= LIMITE_FREE)
      return setMsg(
        `Versione gratuita: massimo ${LIMITE_FREE} ricevute per anno. Passa a Pro (in Impostazioni) per ricevute illimitate, archivio pluriennale e pacchetto commercialista.`
      );
    const lordo = validaImporto(f.lordo);
    const cliente = pulisciTesto(f.cliente, 80);
    if (!cliente || cliente.length < 2) return setMsg("Committente mancante o troppo corto.");
    if (lordo === null) return setMsg("Importo non valido: usa cifre con massimo 2 decimali (es. 600 o 600,50).");
    if (!validaData(f.data)) return setMsg("Data non valida.");
    const annoData = parseInt(f.data.slice(0, 4), 10);
    if (annoData !== anno) return setMsg(`La data è del ${annoData} ma stai registrando sull'anno ${anno}: cambia anno o data.`);
    
    const nuova = {
      id: Date.now(), n: lista.length + 1, cliente,
      data: f.data, lordo, ritenuta: f.ritenuta,
      descr: pulisciTesto(f.descr, 160),
    };
    salvaArchivio({ ...archivio, [anno]: [...lista, nuova] });
    setF({ cliente: "", data: f.data, lordo: "", ritenuta: true, descr: "" });
    setMsg("");
  };

  const elimina = (id) => {
    const nl = lista.filter((r) => r.id !== id).map((r, i) => ({ ...r, n: i + 1 }));
    salvaArchivio({ ...archivio, [anno]: nl });
  };

  const esportaJSON = () =>
    scaricaFile(`soglia-${anno}.json`, JSON.stringify({ anno, conf, ricevute: lista }, null, 2), "application/json");

  const esportaBackup = () =>
    scaricaFile(
      `soglia-backup-completo-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ tipo: "backup-completo", versione: 1, conf, archivio }, null, 2),
      "application/json"
    );

  const validaRiga = (r, incrementoId) =>
    r.cliente && validaImporto(String(r.lordo)) !== null && validaData(r.data)
      ? {
          id: Date.now() + incrementoId, n: 1,
          cliente: pulisciTesto(r.cliente, 80), data: r.data,
          lordo: validaImporto(String(r.lordo)),
          ritenuta: !!r.ritenuta, descr: pulisciTesto(r.descr || "", 160),
        }
      : null;

  const esportaCSV = () => {
    const righe = [["numero", "data", "committente", "descrizione", "lordo", "ritenuta_20", "netto"]];
    lista.forEach((r) => {
      const c = calc(r.lordo, r.ritenuta);
      righe.push([r.n, dataIT(r.data), `"${r.cliente}"`, `"${r.descr}"`, r.lordo.toFixed(2), c.rit.toFixed(2), c.netto.toFixed(2)]);
    });
    scaricaFile(`soglia-${anno}.csv`, righe.map((x) => x.join(";")).join("\n"), "text/csv");
  };

  const pacchettoCommercialista = () => {
    if (!pro) {
      setVista("impostazioni");
      setMsg("Il pacchetto commercialista è una funzione Pro. Backup ed export restano sempre gratuiti.");
      return;
    }
    const sommario =
      `RIEPILOGO PRESTAZIONI OCCASIONALI — ANNO ${anno}\n` +
      `Generato il ${new Date().toLocaleDateString("it-IT")}\n\n` +
      `Numero ricevute: ${lista.length}\n` +
      `Totale lordo: ${eur(tot)}\n` +
      `Totale ritenute 20%: ${eur(lista.reduce((s, r) => s + calc(r.lordo, r.ritenuta).rit, 0))}\n` +
      `Totale netto: ${eur(lista.reduce((s, r) => s + calc(r.lordo, r.ritenuta).netto, 0))}\n` +
      `Tetto annuo configurato: ${eur(capNum)} — utilizzato: ${pct.toFixed(1)}%\n\n` +
      `DETTAGLIO:\n` +
      lista.map((r) => {
        const c = calc(r.lordo, r.ritenuta);
        return `${String(r.n).padStart(2, "0")} | ${dataIT(r.data)} | ${r.cliente} | lordo ${eur(r.lordo)} | ritenuta ${eur(c.rit)} | netto ${eur(c.netto)}`;
      }).join("\n");
    scaricaFile(`riepilogo-commercialista-${anno}.txt`, sommario, "text/plain");
    esportaCSV();
  };

  const importa = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dati = JSON.parse(reader.result);

        if (dati.tipo === "backup-completo" && dati.archivio && typeof dati.archivio === "object") {
          const esistenti = Object.values(archivio).reduce((s, a) => s + a.length, 0);
          if (esistenti > 0 && !window.confirm(`Attenzione: il ripristino sovrascriverà le ${esistenti} ricevute attuali con quelle del backup. Procedere?`)) {
            setMsg("Ripristino annullato.");
            return;
          }
          const nuovo = {};
          let totali = 0;
          let idCounter = 0; 

          for (const [a, righe] of Object.entries(dati.archivio)) {
            if (!Array.isArray(righe)) continue;
            const valide = righe
              .map((r) => { idCounter++; return validaRiga(r, idCounter); })
              .filter(Boolean)
              .map((r, i) => ({ ...r, n: i + 1 }));
            if (valide.length) { nuovo[a] = valide; totali += valide.length; }
          }
          salvaArchivio(nuovo);
          if (dati.conf) {
            const iCap = parseFloat(String(dati.conf.cap).replace(",", ".")) || 5000;
            const iBollo = parseFloat(String(dati.conf.bollo).replace(",", ".")) || 77.47;
            const confNormalizzata = { cap: iCap, bollo: iBollo };
            setConf(confNormalizzata);
            scrivi("sogliapro:conf", confNormalizzata);
          }
          setMsg(`Backup ripristinato: ${totali} ricevute su ${Object.keys(nuovo).length} anni.`);
          return;
        }

        if (!dati.ricevute || !Array.isArray(dati.ricevute)) throw new Error("struttura non riconosciuta");
        let idCounterSingolo = 0;
        const valide = dati.ricevute
          .map((r) => { idCounterSingolo++; return validaRiga(r, idCounterSingolo); })
          .filter(Boolean)
          .map((r, i) => ({ ...r, n: i + 1 }));
        const a = dati.anno || anno;
        if ((archivio[a] || []).length > 0 && !window.confirm(`L'anno ${a} contiene già ${archivio[a].length} ricevute: verranno sostituite. Procedere?`)) {
          setMsg("Importazione annullata.");
          return;
        }
        salvaArchivio({ ...archivio, [a]: valide });
        setAnno(a);
        setMsg(`Importate ${valide.length} ricevute sull'anno ${a}.`);
      } catch (e) {
        setMsg("File non valido: " + e.message);
      }
    };
    reader.readAsText(file);
    ev.target.value = "";
  };

  const mensili = Array.from({ length: 12 }, (_, m) =>
    lista.filter((r) => parseInt(r.data.slice(5, 7), 10) === m + 1).reduce((s, r) => s + r.lordo, 0)
  );
  const max = Math.max(...mensili, 1);
  
  let mesiPassati = 12;
  if (anno === ANNO_CORRENTE) mesiPassati = new Date().getMonth() + 1;
  else if (anno > ANNO_CORRENTE) mesiPassati = 1; 

  const media = tot / Math.max(1, mesiPassati);
  const proiezione = anno === ANNO_CORRENTE ? media * 12 : tot;

  const avviaStampa = () => {
    window.print();
    setTimeout(() => setStampaR(null), 500);
  };

  if (stampaR) {
    const r = stampaR;
    const c = calc(r.lordo, r.ritenuta);
    return (
      <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "Georgia, serif", color: "#1A1A1A" }}>
        <style>{`@media print { .no-print { display:none !important; } }`}</style>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: 32 }}>
          <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button style={{ ...stBtn(true), flex: 1 }} onClick={avviaStampa}>Stampa / Salva come PDF</button>
            <button style={{ ...stBtn(false), background: "#eee", color: "#333", border: "1px solid #ccc" }} onClick={() => setStampaR(null)}>Indietro</button>
          </div>
          <h1 style={{ fontSize: 18, letterSpacing: 1, borderBottom: "2px solid #1A1A1A", paddingBottom: 8 }}>
            RICEVUTA PER PRESTAZIONE OCCASIONALE N. {r.n}/{anno}
          </h1>
          <p style={{ fontSize: 14, marginTop: 18 }}>Data: <b>{dataIT(r.data)}</b></p>
          <p style={{ fontSize: 14 }}>Committente: <b>{r.cliente}</b></p>
          {r.descr && <p style={{ fontSize: 14 }}>Prestazione: {r.descr}</p>}
          <table style={{ width: "100%", marginTop: 18, fontSize: 14, borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={{ padding: "6px 0" }}>Compenso lordo</td><td style={{ textAlign: "right" }}>{eur(r.lordo)}</td></tr>
              <tr>
                <td style={{ padding: "6px 0" }}>Ritenuta d'acconto 20%{r.ritenuta ? "" : " (non applicata: committente privato)"}</td>
                <td style={{ textAlign: "right" }}>{r.ritenuta ? "-" + eur(c.rit) : eur(0)}</td>
              </tr>
              <tr style={{ borderTop: "1px solid #1A1A1A", fontWeight: 700 }}>
                <td style={{ padding: "8px 0" }}>Netto a pagare</td><td style={{ textAlign: "right" }}>{eur(c.netto)}</td>
              </tr>
            </tbody>
          </table>
          {c.netto > bolloNum && (
            <p style={{ fontSize: 12, marginTop: 10 }}>
              Imposta di bollo di € 2,00 dovuta (netto superiore a {eur(bolloNum)}). Spazio per la marca: ▢
            </p>
          )}
          <p style={{ fontSize: 11, color: "#444", marginTop: 24, lineHeight: 1.6 }}>
            Prestazione di lavoro autonomo occasionale ai sensi dell'art. 67, comma 1, lett. l) del TUIR
            (D.P.R. 917/1986), svolta senza vincolo di subordinazione né abitualità, non soggetta a IVA
            ai sensi dell'art. 5 del D.P.R. 633/1972.
          </p>
          <p style={{ fontSize: 14, marginTop: 40 }}>Firma del prestatore: ________________________</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.fondo, fontFamily: "system-ui, sans-serif" }}>
      <style>{`button:disabled{opacity:.5}`}</style>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px" }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.testo, margin: 0 }}>
            Soglia <span style={{ color: T.oro }}>Pro</span>
          </h1>
          <p style={{ fontSize: 13, color: T.muto, marginTop: 2 }}>
            Prestazione occasionale sotto controllo: tetto, ricevute, archivio, commercialista.
          </p>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {[["registro", "Registro"], ["dashboard", "Dashboard"], ["impostazioni", "Impostazioni"]].map(([id, nome]) => (
              <button key={id} onClick={() => setVista(id)} style={{ ...stBtn(vista === id), flex: 1, padding: "8px 0" }}>
                {nome}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: T.muto }}>Anno:</span>
            {[ANNO_CORRENTE - 1, ANNO_CORRENTE, ANNO_CORRENTE + 1].map((a) => {
              const bloccato = !pro && a !== ANNO_CORRENTE;
              return (
                <button key={a}
                  onClick={() => {
                    if (bloccato) {
                      setVista("impostazioni");
                      setMsg("L'archivio pluriennale è una funzione Pro.");
                    } else setAnno(a);
                  }}
                  style={{ ...stBtn(anno === a), padding: "6px 12px", fontSize: 12, opacity: bloccato ? 0.6 : 1 }}>
                  {bloccato ? "🔒 " : ""}{a}{archivio[a] && archivio[a].length ? ` (${archivio[a].length})` : ""}
                </button>
              );
            })}
            {!pro && <span style={{ fontSize: 11, color: T.muto, marginLeft: "auto" }}>{lista.length}/{LIMITE_FREE} gratuite</span>}
          </div>
        </header>

        {vista === "registro" && (
          <div>
            <div style={stCard}>
              <Et c={`CAPIENZA RESIDUA ${anno}`} />
              <p style={{ fontSize: 30, fontWeight: 700, color: tot >= capNum ? T.rosso : T.testo, margin: 0 }}>
                {eur(Math.max(0, capNum - tot))}
              </p>
              <div style={{ height: 10, background: T.fondo, borderRadius: 99, marginTop: 10, overflow: "hidden" }}>
                <div style={{ height: "100%", width: pct + "%", background: pct >= 90 ? T.rosso : pct >= 70 ? T.oro : T.verde }} />
              </div>
              <p style={{ fontSize: 12, color: T.muto, marginTop: 8 }}>
                Incassato {eur(tot)} — {pct.toFixed(0)}% del tetto di {eur(capNum)}
              </p>
              {pct >= 90 && <p style={{ fontSize: 13, color: T.rosso, marginTop: 8 }}>Vicino al limite: oltre {eur(capNum)} serve valutare la partita IVA.</p>}
            </div>

            <div style={stCard}>
              <Et c="NUOVA RICEVUTA" />
              <div style={{ display: "grid", gap: 10 }}>
                <input style={stIn} placeholder="Committente" value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input type="date" style={stIn} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
                  <input style={stIn} placeholder="Lordo (es. 600,50)" inputMode="decimal" value={f.lordo} onChange={(e) => setF({ ...f, lordo: e.target.value })} />
                </div>
                <input style={stIn} placeholder="Descrizione (facoltativa)" value={f.descr} onChange={(e) => setF({ ...f, descr: e.target.value })} />
                <button style={stBtn(false)} onClick={() => setF({ ...f, ritenuta: !f.ritenuta })}>
                  Ritenuta 20%: {f.ritenuta ? "SÌ (committente azienda/P.IVA)" : "NO (committente privato)"}
                </button>
                {msg && <p style={{ fontSize: 13, color: msg.startsWith("Importate") || msg.startsWith("Backup") ? T.verde : T.rosso, margin: 0 }}>{msg}</p>}
                <button style={stBtn(true)} onClick={aggiungi}>Registra ricevuta</button>
              </div>
            </div>

            {lista.map((r) => {
              const c = calc(r.lordo, r.ritenuta);
              return (
                <div key={r.id} style={{ ...stCard, padding: 14 }}>
                  <p style={{ margin: 0, fontSize: 14, color: T.testo }}>
                    <span style={{ color: T.oro, fontWeight: 700 }}>{String(r.n).padStart(2, "0")}</span>{" "}
                    <b>{r.cliente}</b>
                    <span style={{ color: T.muto, fontSize: 13 }}> — {dataIT(r.data)} · lordo {eur(r.lordo)} · netto {eur(c.netto)}</span>
                  </p>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button style={{ ...stBtn(true), flex: 1, padding: "8px 0" }} onClick={() => setStampaR(r)}>Stampa / PDF</button>
                    <button style={{ ...stBtn(false), color: T.rosso }} onClick={() => elimina(r.id)}>Elimina</button>
                  </div>
                </div>
              );
            })}
            {lista.length === 0 && <p style={{ fontSize: 13, color: T.muto }}>Nessuna ricevuta sull'anno {anno}.</p>}

            <div style={stCard}>
              <Et c="DATI: BACKUP, EXPORT E IMPORT" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button style={stBtn(true)} onClick={esportaBackup}>Backup completo</button>
                <button style={stBtn(false)} onClick={() => fileRef.current && fileRef.current.click()}>Importa / Ripristina</button>
                <button style={stBtn(false)} onClick={esportaJSON}>Esporta anno (JSON)</button>
                <button style={stBtn(false)} onClick={esportaCSV}>Esporta anno (CSV)</button>
                <button style={{ ...stBtn(false), gridColumn: "1 / -1" }} onClick={pacchettoCommercialista}>Pacchetto commercialista (riepilogo + CSV)</button>
              </div>
              <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={importa} />
              <p style={{ fontSize: 11, color: T.muto, marginTop: 10, lineHeight: 1.5 }}>
                I dati vivono SOLO su questo dispositivo: scarica il backup completo periodicamente e conservalo in un luogo sicuro.
              </p>
            </div>
          </div>
        )}

        {vista === "dashboard" && (
          <div>
            <div style={stCard}>
              <Et c={`ANDAMENTO MENSILE ${anno}`} />
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
                {mensili.map((v, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                    <div title={eur(v)} style={{ height: Math.max(2, (v / max) * 100) + "%", background: v > 0 ? T.oro : T.linea, borderRadius: "4px 4px 0 0" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {["G", "F", "M", "A", "M", "G", "L", "A", "S", "O", "N", "D"].map((m, i) => (
                  <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, color: T.muto }}>{m}</span>
                ))}
              </div>
            </div>
            <div style={stCard}>
              <Et c="PROIEZIONE" />
              <p style={{ fontSize: 14, color: T.testo, lineHeight: 1.7, margin: 0 }}>
                Media mensile: <b>{eur(media)}</b><br />
                Proiezione fine anno: <b style={{ color: proiezione > capNum ? T.rosso : T.verde }}>{eur(proiezione)}</b>
                {proiezione > capNum && anno === ANNO_CORRENTE && <span style={{ color: T.rosso }}> — a questo ritmo sfori il tetto.</span>}
              </p>
            </div>
          </div>
        )}

        {vista === "impostazioni" && (
          <div>
            <div style={{ ...stCard, borderLeft: `4px solid ${T.oro}` }}>
              <Et c={pro ? "SOGLIA PRO — ATTIVO ✓" : "PASSA A SOGLIA PRO"} />
              {pro ? (
                <p style={{ fontSize: 13, color: T.testo, margin: 0 }}>Licenza attiva su questo dispositivo. Grazie per il supporto!</p>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: T.testo, marginTop: 0 }}>Con <b>Pro — {PREZZO}</b> sblocchi ricevute illimitate, archivio pluriennale e pacchetto commercialista.</p>
                  <button style={{ ...stBtn(true), width: "100%" }} onClick={() => window.open(LINK_PAGAMENTO, "_blank")}>Acquista Pro</button>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <input style={{ ...stIn, flex: 1 }} placeholder="SOGLIA-XXXXXX" value={codice} onChange={(e) => setCodice(e.target.value)} />
                    <button style={{ ...stBtn(false) }} onClick={attivaPro}>Attiva</button>
                  </div>
                </div>
              )}
              {msg && <p style={{ fontSize: 12, color: msg.includes("attivato") ? T.verde : T.oro, marginTop: 10, marginBottom: 0 }}>{msg}</p>}
            </div>

            <div style={stCard}>
              <Et c="PARAMETRI NORMATIVI (MODIFICABILI)" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: T.muto }}>Tetto annuo (€)</label>
                  <input style={stIn} value={conf.cap} onChange={(e) => setConf({ ...conf, cap: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: T.muto }}>Soglia bollo (€)</label>
                  <input style={stIn} value={conf.bollo} onChange={(e) => setConf({ ...conf, bollo: e.target.value })} />
                </div>
              </div>
              <button style={{ ...stBtn(true), width: "100%", marginTop: 12 }}
                onClick={() => {
                  const cCap = parseFloat(String(conf.cap).replace(",", ".")) || 5000;
                  const cBollo = parseFloat(String(conf.bollo).replace(",", ".")) || 77.47;
                  const nuovaConf = { cap: cCap, bollo: cBollo };
                  setConf(nuovaConf);
                  scrivi("sogliapro:conf", nuovaConf);
                  setMsg("Parametri salvati correttamente.");
                  setVista("registro");
                }}>
                Salva parametri
              </button>
            </div>
          </div>
        )}

        <footer style={{ marginTop: 20, fontSize: 11, color: T.muto, lineHeight: 1.5 }}>
          I dati sono memorizzati nel browser. Verificare i riferimenti normativi prima dell'uso fiscale.
        </footer>
      </div>
    </div>
  );
}