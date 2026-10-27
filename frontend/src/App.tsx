import { type FormEvent, useEffect, useState } from 'react';
import { Activity, ArrowRight, BookOpen, Check, CircleAlert, ClipboardCheck, FileImage, FileText, FlaskConical, HeartPulse, ShieldCheck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ChatPanel from './ChatPanel';

type Patient = { id: string; label: string; demographics: any; clinical: any; biological: any; longitudinal: any[] };
type Result = { analysis_id: string; patient_id: string; agents: any[]; synthesis: any; trace: any };
type View = 'home' | 'clinical' | 'references';
type EntryMode = 'demo' | 'manual';
const api = '/api';
const agentNames: Record<string, string> = {
  clinical: 'Données cliniques', biological: 'Biologie', imaging: 'Imagerie', longitudinal: 'Évolution temporelle',
};
const agentInputs: Record<string, string> = {
  clinical: 'Constantes vitales et examen', biological: 'Résultats biologiques', imaging: 'Imagerie médicale', longitudinal: 'Historique sur 72 heures',
};

type ManualPayload = {
  case_id: string;
  clinical?: Record<string, number>;
  biological?: Record<string, number>;
  imaging_report?: string;
  imaging_demo?: boolean;
  imaging_consent?: boolean;
  imaging_image_base64?: string;
  imaging_mime_type?: 'image/png' | 'image/jpeg' | 'image/webp';
  longitudinal?: Array<{ hours: number; respiratory_rate?: number; spo2?: number; crp?: number }>;
};

function ManualIntake({ busy, onAnalyze }: { busy: boolean; onAnalyze: (payload: ManualPayload) => void }) {
  const [caseId, setCaseId] = useState('CASE-001');
  const [selected, setSelected] = useState<string[]>(['clinical']);
  const [clinical, setClinical] = useState<Record<string, string>>({});
  const [biological, setBiological] = useState<Record<string, string>>({});
  const [report, setReport] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [sampleImage, setSampleImage] = useState(false);
  const [imageConfirmed, setImageConfirmed] = useState(false);
  useEffect(() => {
    if (!imageFile) { setImagePreview(''); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([
    { hours: '0' }, { hours: '24' },
  ]);
  const [error, setError] = useState('');
  const modalities = [
    { id: 'clinical', title: 'Données cliniques', desc: 'Constantes vitales', icon: <HeartPulse size={17}/> },
    { id: 'biological', title: 'Biologie', desc: 'Valeurs de laboratoire', icon: <FlaskConical size={17}/> },
    { id: 'longitudinal', title: 'Suivi temporel', desc: 'Mesures à différents moments', icon: <Activity size={17}/> },
    { id: 'imaging_report', title: 'Imagerie', desc: 'Radiographie et observation IA exploratoire', icon: <FileImage size={17}/> },
  ];
  function numberValues(values: Record<string, string>) {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== '').map(([key, value]) => [key, Number(value)]));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!caseId.trim()) { setError('Saisissez un identifiant de démonstration.'); return; }
    const payload: ManualPayload = { case_id: caseId.trim() };
    if (selected.includes('clinical')) payload.clinical = numberValues(clinical);
    if (selected.includes('biological')) payload.biological = numberValues(biological);
    if (selected.includes('imaging_report')) payload.imaging_report = report.trim();
    if (selected.includes('imaging_report') && (imageFile || sampleImage)) {
      payload.imaging_demo = sampleImage;
      if (!sampleImage && imageFile) {
        if (!imageConfirmed) { setError('Confirmez que cette image est anonymisée et autorisée pour son envoi au fournisseur multimodal configuré.'); return; }
        payload.imaging_consent = true;
        try {
          if (imageFile.size > 8 * 1024 * 1024) { setError('La taille maximale d’une image est de 8 Mo.'); return; }
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
            reader.readAsDataURL(imageFile);
          });
          const [header, base64] = dataUrl.split(',', 2);
          const mime = header.match(/^data:(image\/(?:png|jpeg|webp));base64$/)?.[1];
          if (!mime || !base64) { setError('Format image non pris en charge. Utilisez PNG, JPEG ou WebP.'); return; }
          payload.imaging_image_base64 = base64;
          payload.imaging_mime_type = mime as ManualPayload['imaging_mime_type'];
        } catch (imageError) {
          setError(imageError instanceof Error ? imageError.message : 'Impossible de préparer l’image.');
          return;
        }
      }
    }
    if (selected.includes('longitudinal')) {
      const trends = rows.map((row) => ({ hours: Number(row.hours || 0), ...numberValues(row) } as NonNullable<ManualPayload['longitudinal']>[number]))
        .filter((row) => row.respiratory_rate !== undefined || row.spo2 !== undefined || row.crp !== undefined);
      if (trends.length > 0 && trends.length < 2) { setError('Saisissez au moins deux points avec des mesures pour l’agent temporel.'); return; }
      if (trends.length) payload.longitudinal = trends;
    }
    const anyValues = !!Object.keys(payload.clinical || {}).length || !!Object.keys(payload.biological || {}).length || !!payload.imaging_report || !!payload.imaging_demo || !!payload.longitudinal?.some((row) => row.respiratory_rate !== undefined || row.spo2 !== undefined || row.crp !== undefined);
    if (!anyValues) { setError('Saisissez au moins une mesure dans les catégories sélectionnées.'); return; }
    onAnalyze(payload);
  }
  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function fillExample() {
    setSelected(['clinical', 'biological', 'longitudinal', 'imaging_report']);
    setClinical({ respiratory_rate: '24', spo2: '92', temperature: '38', heart_rate: '108', systolic_bp: '105' });
    setBiological({ crp: '35', leukocytes: '13', lactate: '1.7', procalcitonin: '0.2', creatinine: '90' });
    setRows([{ hours: '0', respiratory_rate: '20', spo2: '95', crp: '18' }, { hours: '24', respiratory_rate: '24', spo2: '92', crp: '35' }]);
    setSampleImage(true); setImageFile(null); setImageConfirmed(false); setReport('Texte fictif pour la démonstration; non interprété.');
  }
  function useDemoRadiograph() {
    setSelected((current) => current.includes('imaging_report') ? current : [...current, 'imaging_report']);
    setSampleImage(true);
    setImageFile(null);
    setImageConfirmed(false);
    setReport('');
  }
  function numericField(label: string, key: string, state: Record<string, string>, setter: (value: Record<string, string>) => void, unit: string, min = 0, max?: number) {
    return <label className="manual-field" key={key}>{label}<span>{unit}</span><input type="number" step="any" min={min} max={max} value={state[key] || ''} onChange={(event) => setter({ ...state, [key]: event.target.value })}/></label>;
  }
  return <form className="panel manual-intake" onSubmit={submit}>
    <div className="patient-heading"><div><div className="eyebrow">SAISIE PAR MODALITÉ</div><h2>Nouveau cas de démonstration</h2></div><label className="case-id-field">Identifiant pseudonymisé<input value={caseId} maxLength={32} onChange={(event) => setCaseId(event.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}/></label></div>
    <button type="button" className="fill-example" onClick={fillExample}>Remplir l’exemple fictif</button>
    <div className="manual-privacy"><ShieldCheck size={16}/><span>Données fictives uniquement. N’entrez aucune information issue d’un patient réel dans cette application.</span></div>
    <fieldset className="modality-picker"><legend>Choisissez les types de données à transmettre</legend><div>{modalities.map((modality) => <label key={modality.id} className={`modality-option ${selected.includes(modality.id) ? 'selected' : ''}`}><input type="checkbox" checked={selected.includes(modality.id)} onChange={() => toggle(modality.id)}/><span className="modality-icon">{modality.icon}</span><span><b>{modality.title}</b><small>{modality.desc}</small></span></label>)}</div></fieldset>
    {selected.includes('clinical') && <fieldset className="modality-section"><legend><HeartPulse size={16}/> Agent clinique <small>· constantes vitales</small></legend><div className="manual-fields">{numericField('Fréquence respiratoire','respiratory_rate',clinical,setClinical,'/min',1,100)}{numericField('SpO₂','spo2',clinical,setClinical,'%',1,100)}{numericField('Température','temperature',clinical,setClinical,'°C',25,45)}{numericField('Fréquence cardiaque','heart_rate',clinical,setClinical,'bpm',1,300)}{numericField('Pression systolique','systolic_bp',clinical,setClinical,'mmHg',1,300)}</div></fieldset>}
    {selected.includes('biological') && <fieldset className="modality-section"><legend><FlaskConical size={16}/> Agent biologique <small>· résultats de laboratoire</small></legend><div className="manual-fields">{numericField('CRP','crp',biological,setBiological,'mg/L')}{numericField('Leucocytes','leukocytes',biological,setBiological,'10⁹/L')}{numericField('Lactate','lactate',biological,setBiological,'mmol/L')}{numericField('Procalcitonine','procalcitonin',biological,setBiological,'ng/mL')}{numericField('Créatinine','creatinine',biological,setBiological,'µmol/L')}</div></fieldset>}
    {selected.includes('longitudinal') && <fieldset className="modality-section"><legend><Activity size={16}/> Agent temporel <small>· mesures sérielles</small></legend>{rows.map((row,index) => <div className="trend-row" key={index}><b>Point {index+1}</b>{numericField('Heures','hours',row,(value)=>setRows(rows.map((item,i)=>i===index?value:item)),'h',0,10000)}{numericField('Fréquence respiratoire','respiratory_rate',row,(value)=>setRows(rows.map((item,i)=>i===index?value:item)),'/min',1,100)}{numericField('SpO₂','spo2',row,(value)=>setRows(rows.map((item,i)=>i===index?value:item)),'%',1,100)}{numericField('CRP','crp',row,(value)=>setRows(rows.map((item,i)=>i===index?value:item)),'mg/L')}</div>)}<button className="add-point" type="button" onClick={()=>setRows([...rows,{hours:String(rows.length*24)}])}>+ Ajouter un point de suivi</button></fieldset>}
    {selected.includes('imaging_report') && <fieldset className="modality-section imaging-limited"><legend><FileImage size={16}/> Démonstration d’imagerie <small>· visuel de démonstration</small></legend><p>La radiographie de démonstration est affichée avec son image de sortie associée.</p><button type="button" className="use-demo-xray" onClick={useDemoRadiograph}>Utiliser la radiographie de démonstration</button><label className="image-upload">Choisir une image depuis cet appareil<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { setImageFile(event.target.files?.[0] || null); setSampleImage(false); setImageConfirmed(false); }}/></label>{imageFile && <div className="image-preview"><img src={imagePreview} alt="Aperçu local du fichier sélectionné"/><span>{imageFile.name} · aperçu local seulement</span></div>}{(imageFile || sampleImage) && <label className="image-consent"><input type="checkbox" checked={imageConfirmed} onChange={(event) => setImageConfirmed(event.target.checked)}/><span>{sampleImage ? 'Je confirme utiliser la paire d’images fournie avec le cas de démonstration.' : 'Je confirme que cette image est anonymisée et accepte son envoi au fournisseur multimodal configuré pour une observation exploratoire.'}</span></label>}{sampleImage && <div className="demo-radiograph-pair"><figure><img src="/api/demo/radiograph/image" alt="Radiographie thoracique de démonstration"/><figcaption>Image originale · test.png</figcaption></figure><figure><img src="/api/demo/radiograph/heatmap" alt="Carte de chaleur illustrative pré-calculée sur la radiographie"/><figcaption>Image de sortie associée · test expl.jpeg</figcaption></figure><p role="note">Image de sortie associée à la radiographie d’entrée.</p></div>}<textarea rows={2} maxLength={4000} value={report} placeholder="Note fictive facultative; elle ne sera pas interprétée…" onChange={(event)=>setReport(event.target.value)}/></fieldset>}
    {error && <p role="alert" className="chat-error">{error}</p>}<div className="manual-submit"><span>{selected.length} agent(s) sélectionné(s) · les données manquantes seront ignorées</span><button type="submit" disabled={busy}>{busy?'Analyse en cours…':'Transmettre aux agents'}</button></div>
  </form>;
}

function LandingPage({ onOpenAnalysis, onOpenReferences }: { onOpenAnalysis: () => void; onOpenReferences: () => void }) {
  return <div className="landing-page">
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="hero-copy">
        <div className="hero-kicker"><span /> AIDE À LA DÉCISION CLINIQUE · PNEUMONIE ADULTE</div>
        <h1 id="landing-title">Mieux relier les données. Garder la décision au médecin.</h1>
        <p className="hero-lede">MedAgent présente un parcours de revue clinique où plusieurs sources de données et références médicales peuvent être examinées ensemble, avec le médecin au centre.</p>
        <div className="hero-actions">
          <button className="hero-primary" onClick={onOpenAnalysis}>Découvrir la démonstration <ArrowRight size={17}/></button>
          <button className="hero-secondary" onClick={onOpenReferences}><BookOpen size={16}/> Explorer l’assistant documentaire</button>
        </div>
        <div className="hero-assurance"><ShieldCheck size={17}/><span>Parcours conçu pour rendre visibles les sources, limites et étapes de revue.</span></div>
      </div>
    </section>

    <section className="landing-section landing-value" id="approche">
      <div className="landing-section-heading"><span className="landing-eyebrow">UNE APPROCHE PLUS LISIBLE</span><h2>Une vue d’ensemble, sans boîte noire.</h2><p>Les informations sont présentées par source pour aider le médecin à comprendre ce qui contribue à la synthèse et ce qui reste à vérifier.</p></div>
      <div className="value-cards">
        <article><span className="value-icon indigo"><LayersIcon/></span><small>01 · MULTISOURCE</small><h3>Quatre perspectives</h3><p>Clinique, biologie, évolution et imagerie sont organisées en expertises distinctes.</p></article>
        <article><span className="value-icon teal"><BookOpen size={20}/></span><small>02 · DOCUMENTÉE</small><h3>Sources consultables</h3><p>Le chat documentaire retrouve des passages dans les références importées et les cite pour vérification.</p></article>
        <article><span className="value-icon amber"><ShieldCheck size={20}/></span><small>03 · SUPERVISÉE</small><h3>Le médecin aux commandes</h3><p>La synthèse est soumise à la revue du médecin, qui peut la valider, la modifier ou la rejeter.</p></article>
      </div>
    </section>

    <section className="landing-process" id="parcours">
      <div className="landing-process-copy"><span className="landing-eyebrow">DU DOSSIER À LA REVUE</span><h2>Un parcours pensé autour du raisonnement clinique.</h2><p>La démonstration illustre comment les données et les références peuvent être rapprochées, tout en gardant leurs limites visibles.</p><button className="text-link" onClick={onOpenAnalysis}>Voir le parcours médecin <ArrowRight size={16}/></button></div>
      <div className="process-steps">
        <article><span>01</span><div><b>Rassembler</b><p>Saisir les catégories utiles ou choisir un cas de démonstration fictif.</p></div></article>
        <article><span>02</span><div><b>Examiner</b><p>Consulter séparément les sorties des agents et les références pertinentes.</p></div></article>
        <article><span>03</span><div><b>Décider</b><p>Le médecin vérifie les éléments et enregistre sa décision de revue.</p></div></article>
      </div>
    </section>

    <section className="landing-scope" id="perimetre"><div className="scope-symbol"><FlaskConical size={22}/></div><div><span className="landing-eyebrow">PÉRIMÈTRE DE LA DÉMONSTRATION</span><h2>Pneumonie communautaire chez l’adulte</h2><p>Un domaine clinique ciblé pour parcourir les quatre agents et la revue du médecin.</p></div><button onClick={onOpenReferences}>Voir l’assistant documentaire <ArrowRight size={16}/></button></section>
    <section className="landing-disclaimer"><ShieldCheck size={17}/><p><b>Démonstration éducative.</b> Le parcours présente quatre agents autour d’un cas de pneumonie communautaire adulte.</p></section>
  </div>;
}

function LayersIcon() {
  return <><Activity size={20}/></>;
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [entryMode, setEntryMode] = useState<EntryMode>('demo');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [pid, setPid] = useState('DEMO-005');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [savingDecision, setSavingDecision] = useState<'accept' | 'modify' | 'reject' | null>(null);
  useEffect(() => {
    fetch(`${api}/patients`).then((response) => response.json()).then(setPatients)
      .catch(() => setMessage('Service indisponible. Vérifiez que l’application est lancée.'));
  }, []);
  useEffect(() => {
    if (pid) fetch(`${api}/patients/${pid}`).then((response) => response.json()).then(setPatient).catch(() => {});
  }, [pid]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (view !== 'clinical' || !patients.length || !['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
      const index = patients.findIndex((item) => item.id === pid);
      setPid(patients[(index + (event.key === 'ArrowRight' ? 1 : -1) + patients.length) % patients.length].id);
      setResult(null); setReviewed(false); setReviewComment('');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [patients, pid, view]);

  async function analyze() {
    setBusy(true); setMessage('Exécution des analyses spécialisées…');
    setReviewed(false); setReviewComment('');
    try {
      const response = await fetch(`${api}/analyze/${pid}`, { method: 'POST' });
      if (!response.ok) throw new Error();
      setResult(await response.json());
      setMessage('Synthèse des agents disponible pour revue médicale.');
    } catch {
      setMessage('Impossible de joindre le service d’analyse.');
    } finally { setBusy(false); }
  }

  async function analyzeManual(payload: ManualPayload) {
    setBusy(true); setResult(null); setReviewed(false); setReviewComment('');
    setMessage('Transmission des catégories sélectionnées aux agents…');
    try {
      const response = await fetch(`${api}/analyze/manual`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const resultData = await response.json();
      if (!response.ok) throw new Error(resultData.detail?.[0]?.msg || 'Les données saisies sont invalides.');
      setPatient(null);
      setResult(resultData);
      setMessage('Les agents ont terminé. Vérifiez leur disponibilité et les données utilisées.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Impossible de joindre le service d’analyse.');
    } finally { setBusy(false); }
  }

  async function decide(decision: 'accept' | 'modify' | 'reject') {
    if (!result || savingDecision) return;
    setSavingDecision(decision);
    try {
      const response = await fetch(`${api}/decisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_id: result.analysis_id, patient_id: result.patient_id, decision, comment: reviewComment }),
      });
      if (!response.ok) throw new Error();
      setReviewed(true);
      setMessage(decision === 'accept' ? 'Validation médicale prise en compte pour la démonstration.' : decision === 'modify' ? 'Décision modifiée prise en compte pour la démonstration.' : 'Rejet pris en compte pour ce cas de démonstration.');
    } catch { setMessage('La décision n’a pas pu être enregistrée.'); }
    finally { setSavingDecision(null); }
  }

  return <main>
    <header className="app-header">
      <button className="brand-button" onClick={() => { setView('home'); setMessage(''); }} aria-label="MedAgent, accueil"><div className="brand"><div className="brand-mark"><img src="/logo.png" alt="" /></div><div className="brand-copy"><strong>MEDAGENT</strong><span>Aide à la décision clinique</span></div></div></button>
      <nav className="site-nav" aria-label="Navigation principale">
        <button className={view === 'home' ? 'active' : ''} onClick={() => { setView('home'); setMessage(''); }}>Accueil</button>
        <button className={view === 'clinical' ? 'active' : ''} onClick={() => { setView('clinical'); setMessage(''); }}>Parcours médecin</button>
        <button className={view === 'references' ? 'active' : ''} onClick={() => { setView('references'); setMessage(''); }}>Assistant documentaire</button>
      </nav>
      <button className="nav-cta" onClick={() => { setView('clinical'); setMessage(''); }}>Ouvrir la démonstration <ArrowRight size={15}/></button>
    </header>
    {view !== 'home' && message && <p role="status" className="status">{message}</p>}
    {view === 'home' ? <LandingPage onOpenAnalysis={() => { setMessage(''); setView('clinical'); }} onOpenReferences={() => { setMessage(''); setView('references'); }} /> : view === 'references' ? <ChatPanel /> : <>
      <div className="clinical-intro"><div><div className="eyebrow"><HeartPulse size={15} /> PARCOURS CLINIQUE</div><h2>Analyse multidisciplinaire</h2><p>Quatre agents examinent des sources de données différentes. Le médecin garde la décision finale.</p></div><span className="clinical-scope"><FlaskConical size={15} /> Pathologie ciblée : pneumonie communautaire adulte</span></div>
      <div className="warning"><ShieldCheck size={16} /><span>Cas de démonstration · données de synthèse.</span></div>
      {entryMode === 'demo' && <div className="demo-image-consent"><span className="demo-source-icon"><FileImage size={18}/></span><span><b>{pid === 'DEMO-005' ? 'Cas complet associé aux images de test' : 'Dossier de démonstration synthétique'}</b>{pid === 'DEMO-005' ? 'Les fichiers test.png et test expl.jpeg sont associés à ce cas pour la démonstration des quatre agents.' : 'Choisissez DEMO-005 pour parcourir les quatre agents avec les images associées.'}</span></div>}
      <nav className="workflow"><b className="current"><span>1</span> Patient</b><i /><b className={result ? 'current' : ''}><span>2</span> Agents</b><i /><b className={result ? 'current' : ''}><span>3</span> Synthèse</b><i /><b className={reviewed ? 'current' : ''}><span>4</span> Revue médicale</b></nav>
      <div className={`entry-tabs ${entryMode}`} role="tablist" aria-label="Mode de saisie">
        <button type="button" role="tab" aria-selected={entryMode === 'demo'} className={entryMode === 'demo' ? 'active' : ''} onClick={() => { setEntryMode('demo'); setResult(null); setReviewed(false); fetch(`${api}/patients/${pid}`).then((response) => response.json()).then(setPatient); }}>Cas de démonstration</button>
        <button type="button" role="tab" aria-selected={entryMode === 'manual'} className={entryMode === 'manual' ? 'active' : ''} onClick={() => { setEntryMode('manual'); setResult(null); setReviewed(false); setPatient(null); }}>Saisie manuelle par catégorie</button>
      </div>
      {entryMode === 'manual' && <ManualIntake busy={busy} onAnalyze={analyzeManual} />}
      <section className="panel patient-panel"><div className="patient-heading"><div><div className="eyebrow">DOSSIER DE DÉMONSTRATION</div><h2>Sélection du patient</h2></div><span className="synthetic-tag"><ShieldCheck size={14} /> Données fictives</span></div>
        <div className="row patient-controls"><div><label htmlFor="patient">Cas clinique synthétique</label><select id="patient" value={pid} onChange={(event) => { setPid(event.target.value); setResult(null); setReviewed(false); setReviewComment(''); }}>
          {patients.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.label}</option>)}
        </select></div><button onClick={analyze} disabled={busy || !patient}><Activity size={15} /> {busy ? 'Analyse en cours…' : result ? 'Relancer l’analyse' : 'Analyser les quatre agents'}</button></div>
        {patient && <div className="facts"><span><small>Âge</small>{patient.demographics.age} ans</span><span><small>Sexe</small>{patient.demographics.sex}</span><span><small>Fréquence respiratoire</small>{patient.clinical.respiratory_rate}/min</span><span><small>SpO₂</small>{patient.clinical.spo2}%</span><span><small>Fréquence cardiaque</small>{patient.clinical.heart_rate}/min</span><span><small>Température</small>{patient.clinical.temperature} °C</span></div>}
      </section>
      {!result && <section className="agent-preview"><div><div className="eyebrow">ANALYSE PAR SOURCE DE DONNÉES</div><h2>Quatre expertises spécialisées</h2><p>Lancez l’analyse pour examiner les données disponibles et leurs limites.</p></div><div className="agent-preview-grid">{Object.entries(agentNames).map(([key, title], index) => <article key={key}><span className="agent-number">0{index + 1}</span><div><b>{title}</b><small>{agentInputs[key]}</small></div></article>)}</div></section>}
      {result && <>
        <section className="agent-results"><div className="section-heading"><div><div className="eyebrow">ANALYSE SPÉCIALISÉE</div><h2>Résultats des agents</h2></div><span className="result-tag"><Check size={14} /> Analyse terminée</span></div>
          <div className="cards">{result.agents.map((agent) => <article className={`agent agent-${agent.agent} ${!agent.available ? 'muted' : ''}`} key={agent.agent}>
            <div className="agent-card-heading"><div className={`agent-symbol ${agent.available ? '' : 'unavailable'}`}>{agent.agent === 'imaging' ? <Activity size={17} /> : agent.agent === 'biological' ? <FlaskConical size={17} /> : agent.agent === 'longitudinal' ? <Activity size={17} /> : <HeartPulse size={17} />}</div><div><h3>{agentNames[agent.agent] || agent.agent}</h3><small>{agentInputs[agent.agent]}</small></div></div>
            {agent.available && agent.risk_score !== null ? <div className="agent-score"><strong>{Math.round(agent.risk_score * 100)}<small>/100</small></strong><span>Indice de démonstration</span></div> : agent.available ? <div className="agent-observation"><strong>{agent.artifacts?.demo_heatmap ? 'Visuel préexistant' : 'Observation visuelle'}</strong><span>Sans score de risque</span></div> : <div className="agent-unavailable"><CircleAlert size={15} /> Analyse non disponible</div>}
            {agent.findings.map((finding: string) => <p className="agent-finding" key={finding}>{finding}</p>)}
            {agent.evidence?.length > 0 && <div className="agent-input-data"><strong>Données examinées</strong>{agent.evidence.map((item: any) => <div key={item.name}><span>{item.name}</span><b>{item.value}</b></div>)}</div>}
            {agent.warnings.map((warning: string) => <p className="agent-warning" key={warning}>{warning}</p>)}
            {agent.agent === 'imaging' && agent.artifacts?.demo_heatmap && <div className="result-radiograph-pair"><figure><img src="/api/demo/radiograph/image" alt="Radiographie de démonstration test.png"/><figcaption>Entrée · test.png</figcaption></figure><figure><img src="/api/demo/radiograph/heatmap" alt="Visualisation associée test expl.jpeg"/><figcaption>Sortie associée · test expl.jpeg</figcaption></figure><p>Image de sortie associée à la radiographie d’entrée.</p></div>}
          </article>)}</div>
        </section>
        <section className="panel synthesis-panel"><div className="section-heading"><div><div className="eyebrow">COLLABORATION DES AGENTS</div><h2>Synthèse multidisciplinaire</h2></div>{result.synthesis.priority_review && <span className="priority"><CircleAlert size={15} /> Revue médicale prioritaire</span>}</div>
          <div className="agent-decisions"><div><h3>Position de chaque agent</h3><p>Chaque agent expose son avis sur sa catégorie de données. Les catégories absentes ou sans analyse active ne reçoivent pas de décision inventée; le médecin garde la décision finale.</p></div><div className="agent-decision-grid">{(result.synthesis.agent_decisions || []).map((item: any) => <article key={item.agent}><div><b>{agentNames[item.agent] || item.agent}</b><span className={item.available ? 'decision-state available' : 'decision-state'}>{item.available ? 'Résultat disponible' : 'Aucun avis'}</span></div><strong>{item.position}</strong>{item.findings?.map((finding: string) => <p key={finding}>{finding}</p>)}{item.warnings?.map((warning: string) => <small key={warning}>{warning}</small>)}</article>)}</div></div>          <div className="example-decision"><b>Synthèse des agents</b><span>{result.synthesis.example_decision || 'Synthèse de démonstration à vérifier par le médecin.'}</span></div>
          <div className="summary"><div className="summary-score"><small>Niveau de vigilance</small><h2 className={`risk ${result.synthesis.risk_level.toLowerCase()}`}>{result.synthesis.risk_level}</h2><small>Indice de démonstration {result.synthesis.risk_score} · incertitude {Math.round(result.synthesis.uncertainty * 100)}%</small></div><p>{result.synthesis.narrative}<br/><strong>Synthèse calculée à partir des catégories de données disponibles.</strong></p></div>
          <div className="synthesis-grid"><div><h3>Éléments ayant contribué à la synthèse</h3>{result.synthesis.top_evidence.map((evidence: any) => <p className="evidence" key={evidence.name}><b>{evidence.name}</b><span>{evidence.value}</span><small>Agent : {agentNames[evidence.source] || evidence.source}</small></p>)}</div>
            <div><h3>Contribution des agents disponibles</h3><div className="chart"><ResponsiveContainer width="100%" height={220}><BarChart data={Object.entries(result.synthesis.contributions).map(([name, value]) => ({ name: agentNames[name] || name, value }))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis unit="%"/><Tooltip/><Bar dataKey="value" fill="#5969d9" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></div></div>
          {((result.agents.find((agent:any)=>agent.agent==='longitudinal')?.artifacts?.series || patient?.longitudinal || []).length > 0) && <div className="history-panel"><h3>Évolution des constantes</h3><div className="chart"><ResponsiveContainer width="100%" height={230}><LineChart data={result.agents.find((agent:any)=>agent.agent==='longitudinal')?.artifacts?.series || patient?.longitudinal || []}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="hours" unit=" h"/><YAxis/><Tooltip/><Line dataKey="respiratory_rate" name="Fréquence respiratoire" stroke="#b64e56" strokeWidth={2}/><Line dataKey="spo2" name="SpO₂" stroke="#0e887d" strokeWidth={2}/></LineChart></ResponsiveContainer></div></div>}
        </section>
        <section className="panel decision-review"><div className="review-heading"><div className="review-icon"><ClipboardCheck size={20}/></div><div><div className="eyebrow">ÉTAPE FINALE</div><h2>Revue et décision du médecin</h2><p>Examinez la synthèse et les données sources avant d’enregistrer votre décision.</p></div></div>
          <div className="review-disclaimer"><ShieldCheck size={17}/><span>La synthèse ne prend pas de décision à la place du médecin. Vérifiez les données du dossier.</span></div>
          {result.synthesis.risk_score === null ? <><div className="no-result-note"><CircleAlert size={16}/> Aucun indice global n’est disponible. Consultez les résultats individuels des agents.</div><button type="button" className="secondary return-entry" onClick={()=>{setResult(null);setReviewed(false);}}>Retourner à la saisie</button></> : <>
            <label htmlFor="review-comment">Commentaire médical <span>(facultatif)</span></label><textarea id="review-comment" value={reviewComment} maxLength={1000} rows={3} placeholder="Notez votre interprétation, les modifications ou les éléments à revoir…" onChange={(event) => { setReviewComment(event.target.value); setReviewed(false); }}/>
            {reviewed ? <div className="review-confirmation"><Check size={17}/> Décision prise en compte pour ce cas de démonstration.</div> : <div className="actions"><button type="button" disabled={savingDecision !== null} onClick={() => void decide('accept')}><Check size={16}/> {savingDecision === 'accept' ? 'Enregistrement…' : 'Valider la synthèse'}</button><button type="button" className="secondary" disabled={savingDecision !== null} onClick={() => void decide('modify')}>{savingDecision === 'modify' ? 'Enregistrement…' : 'Modifier la décision'}</button><button type="button" className="danger" disabled={savingDecision !== null} onClick={() => void decide('reject')}>{savingDecision === 'reject' ? 'Enregistrement…' : 'Rejeter la synthèse'}</button></div>}
          </>}
        </section>
      </>}
    </>}
    <footer className="site-footer">
      <div className="footer-main"><div className="footer-brand"><div className="brand-mark"><img src="/logo.png" alt="" /></div><div><b>MEDAGENT</b><span>Revue clinique multidisciplinaire</span></div></div><p>Une démonstration d’aide à la décision médicale centrée sur la transparence des sources et la supervision du médecin.</p></div>
      <div className="footer-links"><span>EXPLORER</span><button onClick={() => { setView('home'); setMessage(''); }}>Accueil</button><button onClick={() => { setView('clinical'); setMessage(''); }}>Parcours médecin</button><button onClick={() => { setView('references'); setMessage(''); }}>Assistant documentaire</button></div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} MedAgent · Démonstration éducative</span><span><ShieldCheck size={14}/> Données de démonstration</span></div>
    </footer>
  </main>;
}
