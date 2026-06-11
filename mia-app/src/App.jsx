import { useState, useEffect, useRef } from "react";

const ANNO_CORRENTE = new Date().getFullYear();

// ---------- CONFIGURAZIONE MONETIZZAZIONE ----------
const API_URL = "https://tua-api-serverless.workers.dev"; // Modificare con l'endpoint reale in produzione
const LINK_PAGAMENTO = "https://buy.stripe.com/IL-TUO-LINK";
const PREZZO = "9,99 €/anno";
const LIMITE_ANONIMO = 3; 
const LIMITE_FREE = 10; 

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

// ---------- VALIDAZIONI ----------
const validaImporto = (s) => {
  const pulito = String(s).trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(pulito)) return null; 
  const n = parseFloat(pulito);
  return n > 0 && n <= 100000 ? Math.round(n * 100) / 100 : null;
};
const validaData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
const validaEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const pulisciTesto = (s, max) => String(s).replace(/[<>"]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const dataIT = (iso) => iso.split("-").reverse().join("/");

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

const validaRiga = (r, incrementoId) =>
  r.cliente && validaImporto(String(r.lordo)) !== null && validaData(r.data)
    ? {
        id: Date.now() + incrementoId, n: 1,
        cliente: pulisciTesto(r.cliente, 80), data: r.data,
        lordo: validaImporto(String(r.lordo)),
        ritenuta: !!r.ritenuta, descr: pulisciTesto(r.descr || "", 160),
      }
    : null;

export default function SogliaPro() {
  const [anno, setAnno] = useState(ANNO_CORRENTE);
  const [archivio, setArchivio] = useState({}); 
  const [conf, setConf] = useState({ cap: 5000, bollo: 77.47 });
  const [f, setF] = useState({ cliente: "", data: new Date().toISOString().slice(0, 10), lordo: "", ritenuta: true, descr: "" });
  const [msg, setMsg] = useState("");
  const [vista, setVista] = useState("registro"); 
  const [stampaR, setStampaR] = useState(null);
  
  const [pro, setPro] = useState(false);
  const [emailUtente, setEmailUtente] = useState("");
  const [inputEmail, setInputEmail] = useState("");
  const [licenza, setLicenza] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    leggi("sogliapro:archivio", {}).then(setArchivio);
    leggi("sogliapro:conf", { cap: 5000, bollo: 77.47 }).then(setConf);
    leggi("sogliapro:pro", false).then((v) => setPro(v === true));
    leggi("sogliapro:email", "").then(setEmailUtente);
  }, []);

  const verificaLicenzaServer = async () => {
    if (!licenza.trim()) return setMsg("Inserisci un codice di licenza.");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/verify-license`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: licenza.trim(), email: emailUtente })
      });
      const data = await res.json();
      if (data.valid) {
        setPro(true);
        await scrivi("sogliapro:pro", true);
        setMsg("Soglia Pro attivato con successo!");
      } else {
        setMsg("Codice licenza non valido o scaduto.");
      }
    } catch (e) {
      setMsg("Impossibile connettersi al server di convalida. Riprova più tardi.");
    } finally { setLoading(false); }
  };

  const registraEmailCrescita = async () => {
    if (!validaEmail(inputEmail)) return setMsg("Inserisci un indirizzo email valido.");
    setLoading(true);
    try {
      await fetch(`${API_URL}/register-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inputEmail })
      });
    } catch(e) {}
    
    setEmailUtente(inputEmail);
    await scrivi("sogliapro:email", inputEmail);
    setMsg("Account sbloccato. Ora puoi inserire fino a 10 ricevute!");
    setLoading(false);
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
    if (!emailUtente && lista.length >= LIMITE_ANONIMO) {
      setVista("impostazioni");
      return setMsg(`Hai raggiunto il limite di ${LIMITE_ANONIMO} ricevute anonime. Inserisci la tua email nelle impostazioni per sbloccare gratuitamente fino a ${LIMITE_FREE} slot.`);
    }
    if (!pro && lista.length >= LIMITE_FREE) {
      setVista("impostazioni");
      return setMsg(`Limite della versione free raggiunto (${LIMITE_FREE} ricevute). Passa a Pro per sbloccare l'inserimento illimitato.`);
    }

    const lordo = validaImporto(f.lordo);
    const cliente = pulisciTesto(f.cliente, 80);
    if (!cliente || cliente.length < 2) return setMsg("Committente mancante o troppo corto.");
    if (lordo === null) return setMsg("Importo non valido: usa le cifre con massimo 2 decimali.");
    if (!validaData(f.data)) return setMsg("Data non valida.");
    
    const annoData = parseInt(f.data.slice(0, 4), 10);
    if (annoData !== anno) return setMsg(`La data appartiene al ${annoData} ma stai lavorando sul registro del ${anno}.`);
    
    const nuova = {
      id: Date.now(), n: lista.length + 1, cliente,
      data: f.data, lordo, ritenuta: f.ritenuta,
      descr: pulisciTesto(f.descr, 160),
    };
    salvaArchivio({ ...archivio, [anno]: [...lista, nuova] });
    setF({ cliente: "", data: f.data, lordo: "", ritenuta: true, descr: "" });
    setMsg("");
  };

  const物理_elimina = (id) => {
    const nl = lista.filter((r) => r.id !== id).map((r, i) => ({ ...r, n: i + 1 }));
    salvaArchivio({ ...archivio, [anno]: nl });
  };

  const esportaJSON = () => scaricaFile(`soglia-${anno}.json`, JSON.stringify({ anno, conf, ricevute: lista }, null, 2), "application/json");
  const esportaBackup = () => scaricaFile(`soglia-backup-completo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ tipo: "backup-completo", versione: 1, conf, archivio }, null, 2), "application/json");

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
      setMsg("Il pacchetto commercialista automatico è una funzione esclusiva della licenza Pro.");
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

  if (stampaR) {
    const r = stampaR; const c = calc(r.lordo, r.ritenuta);
    return (
      <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "Georgia, serif", color: "#1A1A1A", padding: 32 }}>
        <h2>RICEVUTA N. {r.n}/{anno}</h2>
        <p>Committente: {r.cliente}</p>
        <p>Lordo: {eur(r.lordo)} | Ritenuta: {eur(c.rit)} | Netto: {eur(c.netto)}</p>
        <button style={stBtn(true)} onClick={() => window.print()}>Stampa nativa</button>
        <button style={{...stBtn(false), marginLeft: 8}} onClick={() => setStampaR(null)}>Chiudi</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.fondo, fontFamily: "system-ui, sans-serif", color: T.testo }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px" }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Soglia <span style={{ color: T.oro }}>Pro</span></h1>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {[["registro", "Registro"], ["dashboard", "Dashboard"], ["impostazioni", "Impostazioni"]].map(([id, nome]) => (
              <button key={id} onClick={() => setVista(id)} style={{ ...stBtn(vista === id), flex: 1 }}>{nome}</button>
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

        {msg && <div style={{ ...stCard, borderColor: T.oro, color: T.oro, fontSize: 13 }}>{msg}</div>}

        {vista === "registro" && (
          <div>
            <div style={stCard}>
              <Et c="CAPIENZA RESIDUA" />
              <p style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>{eur(Math.max(0, capNum - tot))}</p>
              <div style={{ height: 8, background: T.fondo, borderRadius: 4, marginTop: 10, overflow: "hidden" }}>
                <div style={{ height: "100%", width: pct + "%", background: pct >= 90 ? T.rosso : T.verde }} />
              </div>
            </div>

            <div style={stCard}>
              <Et c="NUOVA RICEVUTA" />
              <div style={{ display: "grid", gap: 10 }}>
                <input style={stIn} placeholder="Committente" value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} />
                <input type="date" style={stIn} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
                <input style={stIn} placeholder="Lordo (€)" value={f.lordo} onChange={(e) => setF({ ...f, lordo: e.target.value })} />
                <button style={stBtn(true)} onClick={aggiungi}>Registra nel browser</button>
              </div>
            </div>

            {lista.map((r) => (
              <div key={r.id} style={{ ...stCard, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><b>{r.cliente}</b> - {eur(r.lordo)}</div>
                <div style={{display:"flex", gap: 6}}>
                  <button style={stBtn(false)} onClick={() => setStampaR(r)}>PDF</button>
                  <button style={{ ...stBtn(false), color: T.rosso }} onClick={() => physical_elimina(r.id)}>X</button>
                </div>
              </div>
            ))}
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
            {!emailUtente && (
              <div style={{ ...stCard, borderLeft: `4px solid ${T.verde}` }}>
                <Et c="SBLOCCA 10 RICEVUTE GRATIS" />
                <p style={{ fontSize: 13, color: T.muto }}>Inserisci la tua email per estendere il limite gratuito da 3 a 10 ricevute e ricevere gli aggiornamenti normativi fiscali.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...stIn, flex: 1 }} type="email" placeholder="nome@esempio.com" value={inputEmail} onChange={(e) => setInputEmail(e.target.value)} />
                  <button style={stBtn(true)} disabled={loading} onClick={registraEmailCrescita}>Sblocca</button>
                </div>
              </div>
            )}

            <div style={{ ...stCard, borderLeft: `4px solid ${T.oro}` }}>
              <Et c={pro ? "LICENZA PRO ATTIVA" : "AGGIORNA A SOGLIA PRO"} />
              {pro ? (
                <p style={{ fontSize: 13, color: T.verde }}>✓ Questo dispositivo è abilitato alle funzioni illimitate e al pacchetto commercialista.</p>
              ) : (
                <div>
                  <p style={{ fontSize: 13 }}>Sblocca l'archivio multi-anno, inserimenti infiniti e il pacchetto export per il tuo commercialista a soli {PREZZO}.</p>
                  <button style={{ ...stBtn(true), width: "100%", marginBottom: 12 }} onClick={() => window.open(LINK_PAGAMENTO, "_blank")}>Acquista Licenza</button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={{ ...stIn, flex: 1 }} placeholder="Inserisci il codice ricevuto per email" value={licenza} onChange={(e) => setLicenza(e.target.value)} />
                    <button style={stBtn(false)} disabled={loading} onClick={verificaLicenzaServer}>Attiva</button>
                  </div>
                </div>
              )}
            </div>

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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}