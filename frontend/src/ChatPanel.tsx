import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { BookOpen, FileText, LockKeyhole, Plus, Send, Sparkles, Trash2 } from 'lucide-react';

type Source = { id: string; source: string; excerpt: string };
type Message = { role: 'user' | 'assistant'; text: string; sources?: Source[]; mode?: string; retrieval_method?: string; citation_status?: string };
type ResearchDocument = { filename: string; extension: string; size_bytes: number };
type RagStatus = { provider: string; model: string | null; remote_processing: boolean; embedding_model: string | null; retrieval?: string; generation?: string };

const suggestions = [
  'Qu’est-ce qu’une pneumonie communautaire chez l’adulte ?',
  'Quels signes cliniques et facteurs de risque peut-on rencontrer ?',
  'Quelles sont les limites des examens biologiques et de l’imagerie ?',
];

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState<ResearchDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
  const [caseContext, setCaseContext] = useState('');
  const [caseFilename, setCaseFilename] = useState('');
  const [caseConfirmed, setCaseConfirmed] = useState(false);
  const [caseUploading, setCaseUploading] = useState(false);
  const [caseTruncated, setCaseTruncated] = useState(false);

  async function refreshDocuments() {
    try {
      const response = await fetch('/api/research-library');
      if (response.ok) setDocuments((await response.json()).documents);
    } catch {
      setError('Impossible de joindre le backend local.');
    }
  }

  useEffect(() => {
    void refreshDocuments();
    fetch('/api/rag/status').then((response) => response.json()).then(setRagStatus).catch(() => {});
  }, []);

  async function send(text = query) {
    const question = text.trim();
    if (!question || busy) return;
    if (caseContext.trim() && !caseConfirmed) {
      setError('Relisez et anonymisez le texte du dossier, puis confirmez avant de poser la question.');
      return;
    }
    setQuery('');
    setError('');
    const history = messages.slice(-6).map(({ role, text: content }) => ({ role, content }));
    setMessages((previous) => [...previous, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: question, history, case_context: caseContext.trim() }),
      });
      if (!response.ok) throw new Error('Le service de recherche a refusé la question.');
      const result = await response.json();
      setMessages((previous) => [...previous, { role: 'assistant', text: result.answer, sources: result.sources, mode: result.mode, retrieval_method: result.retrieval_method, citation_status: result.citation_status }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion au chat.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadCase(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setCaseContext('');
    setCaseFilename('');
    setCaseConfirmed(false);
    setCaseTruncated(false);
    setCaseUploading(true);
    setError('');
    try {
      const response = await fetch('/api/case/extract', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Impossible de lire le dossier.');
      setCaseContext(result.text);
      setCaseFilename(result.filename);
      setCaseTruncated(result.truncated);
      setCaseConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur pendant la lecture du dossier.');
    } finally {
      setCaseUploading(false);
      event.target.value = '';
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files;
    if (!selected?.length) return;
    const body = new FormData();
    Array.from(selected).forEach((file) => body.append('files', file));
    setUploading(true);
    setError('');
    try {
      const response = await fetch('/api/research-library', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Échec de l’import des sources.');
      setDocuments(result.documents);
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur pendant l’import.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function removeDocument(filename: string) {
    const response = await fetch(`/api/research-library/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    if (response.ok) setDocuments((await response.json()).documents);
    else setError('Impossible de supprimer ce document.');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  return (
    <section className="research-assistant" aria-labelledby="research-title">
      <div className="research-header">
        <div>
          <div className="eyebrow"><Sparkles size={15} /> RÉFÉRENTIELS ET DOCUMENTS</div>
          <h2 id="research-title">Assistant d’appui documentaire</h2>
          <p>Posez vos questions sur la pneumonie sans importer de document. Si vous ajoutez des références, l’assistant les consulte en priorité et affiche les passages utilisés.</p>
        </div>
        <span className="privacy-pill"><LockKeyhole size={15} /> {ragStatus?.remote_processing ? 'Gemini actif · envoi à Google' : 'RAG local · aucun envoi IA'}</span>
      </div>

      <div className="research-grid">
        <aside className="source-library" aria-label="Bibliothèque de recherche">
          <div className="library-title"><div className="library-icon"><BookOpen size={18} /></div><div><h3>Bibliothèque médicale</h3><small>{documents.length} {documents.length === 1 ? 'document' : 'documents'}</small></div></div>
          <p>Les documents sont facultatifs. Sans document pertinent, l’assistant répond avec les connaissances générales du modèle; avec des documents pertinents, il s’appuie sur leurs extraits.</p>
          <p className="rag-privacy-note">{ragStatus?.remote_processing ? `Les questions, le texte du dossier et les extraits pertinents sont envoyés à Google Gemini (${ragStatus.model}) pour la recherche et la réponse. N’utilisez aucun dossier identifiable.` : `Les questions et les extraits restent traités localement (${ragStatus?.provider || 'statut en cours'}).`}</p>
          <p className="rag-privacy-note">Recherche : {ragStatus?.retrieval || 'chargement'} · Réponse : {ragStatus?.generation || 'chargement'}</p>
          <label className="upload-button">
            {uploading ? <><span className="spinner" /> Import en cours…</> : <><Plus size={17} /> Ajouter des documents</>}
            <input type="file" accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown" multiple disabled={uploading} onChange={upload} />
          </label>
          <small className="file-types">PDF, TXT ou Markdown · 20 Mo maximum par fichier</small>
          <ul className="document-list">
            {documents.map((document) => (
              <li key={document.filename}>
                <FileText size={17} className="file-icon" />
                <span title={document.filename}>{document.filename}<small>{document.extension.slice(1).toUpperCase()}</small></span>
                <button type="button" className="remove-document" aria-label={`Supprimer ${document.filename}`} onClick={() => void removeDocument(document.filename)}><Trash2 size={15} /></button>
              </li>
            ))}
            {documents.length === 0 && <li className="empty-library"><BookOpen size={22} /><span>Aucun document importé.<br />Vous pouvez déjà poser une question à l’assistant.</span></li>}
          </ul>
          <section className="case-context-card" aria-label="Contexte du dossier patient">
            <h3>Dossier patient · démonstration</h3>
            <p>Importe un dossier fictif ou anonymisé. L’extraction du PDF se fait localement; les PDF scannés (images) ne sont pas reconnus.</p>
            <label className="upload-button case-upload-button">
              {caseUploading ? 'Lecture du dossier…' : caseFilename ? 'Choisir un autre dossier' : 'Ajouter un dossier PDF ou texte'}
              <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" disabled={caseUploading} onChange={uploadCase} />
            </label>
            {caseFilename && <>
              <small className="case-filename">{caseFilename}{caseTruncated ? ' · extrait tronqué à 16 000 caractères' : ''}</small>
              <textarea className="case-context-input" aria-label="Texte extrait du dossier, modifiable et relisible" maxLength={16000} rows={7} value={caseContext} onChange={(event) => { setCaseContext(event.target.value); setCaseConfirmed(false); }} />
              <label className="case-confirm"><input type="checkbox" checked={caseConfirmed} onChange={(event) => setCaseConfirmed(event.target.checked)} /> J’ai relu et anonymisé le texte. Je comprends qu’il sera envoyé à Gemini si l’option est active.</label>
              <button type="button" className="remove-case" onClick={() => { setCaseContext(''); setCaseFilename(''); setCaseConfirmed(false); setCaseTruncated(false); }}>Retirer le dossier</button>
            </>}
          </section>
          <div className="library-footnote"><LockKeyhole size={14} /> Conservé sur cet appareil</div>
        </aside>

        <div className="research-chat">
          <div className="chat-messages" aria-live="polite" aria-label="Conversation de recherche">
            {messages.length === 0 && <div className="welcome-state"><div className="welcome-icon"><Sparkles size={23} /></div><h3>Posez une question sur la pneumonie</h3><p>{caseContext ? 'Posez une question générale ou demandez quels passages des références importées concernent ce dossier.' : documents.length ? 'Les passages pertinents de vos documents seront privilégiés. Si aucun ne correspond à votre question, l’assistant pourra répondre avec les connaissances générales du modèle.' : 'Aucun document à importer pour commencer : l’assistant répond avec les connaissances générales du modèle. Vous pourrez ajouter des références à tout moment pour obtenir des réponses appuyées sur leurs passages.'}</p><div className="welcome-meta"><span><FileText size={14} /> {documents.length ? 'Références importées disponibles' : 'Documents facultatifs'}</span><span><LockKeyhole size={14} /> {ragStatus?.remote_processing ? 'Gemini configuré' : `${ragStatus?.provider || 'Assistant'} configuré`}</span></div></div>}
            {messages.map((message, index) => (
              <article className={`chat-message ${message.role}`} key={`${index}-${message.role}`}>
                <b>{message.role === 'user' ? 'Vous' : message.mode === 'gemini_rag' ? 'Réponse fondée sur vos documents · Gemini' : message.mode === 'ollama_rag' ? 'Réponse fondée sur vos documents · Ollama local' : message.mode === 'extractive_rag' ? 'Extraits de vos documents' : message.mode === 'gemini_general' ? 'Connaissances générales de l’IA · Gemini' : message.mode === 'ollama_general' ? 'Connaissances générales de l’IA · Ollama local' : message.mode === 'no_match' ? 'Réponse générale indisponible' : message.mode === 'refusal' ? 'Limite de l’assistant' : `Assistant${message.mode ? ` · ${message.mode}` : ''}`}</b>
                <p>{message.text}</p>
                {message.role === 'assistant' && <small>{message.mode?.endsWith('_general') ? 'Réponse issue des connaissances générales du modèle, sans document source cité. Vérifiez les recommandations locales à jour.' : ''}{message.retrieval_method === 'bm25_fallback' ? ' Recherche sémantique indisponible : repli BM25 local.' : message.retrieval_method === 'bm25' ? ' Recherche BM25 locale.' : ''}{message.citation_status === 'invalid' ? ' Certaines références générées ont été signalées comme non vérifiées.' : message.citation_status === 'missing' && message.mode?.endsWith('_rag') ? ' La réponse générée ne contient pas de citation vérifiable.' : ''}</small>}
                {!!message.sources?.length && <details><summary>Sources citées ({message.sources.length})</summary><ol>
                  {message.sources.map((source) => <li key={source.id}><b>[{source.id}] {source.source}</b><span>{source.excerpt}</span></li>)}
                </ol></details>}
              </article>
            ))}
            {busy && <p role="status" className="chat-empty">Recherche dans les sources…</p>}
            {error && <p role="alert" className="chat-error">{error}</p>}
          </div>
          <div className="suggestion-label">POUR COMMENCER</div><div className="chat-suggestions" aria-label="Questions proposées">
            {caseContext && <button className="suggestion case-suggestion" type="button" disabled={busy} onClick={() => void send('Pour ce dossier, quels passages des recommandations importées sont pertinents ? Cite les sources et liste les points à vérifier par le médecin.')}>Mettre les recommandations en regard du dossier</button>}
            {suggestions.map((suggestion) => <button className="suggestion" key={suggestion} type="button" disabled={busy} onClick={() => void send(suggestion)}>{suggestion}</button>)}
          </div>
          <form className="chat-form" onSubmit={submit}>
            <label className="sr-only" htmlFor="chat-query">Ta question de recherche</label>
            <textarea id="chat-query" value={query} maxLength={1000} rows={3} placeholder="Ex. Quelles sont les causes fréquentes de pneumonie communautaire ?" onChange={(event) => setQuery(event.target.value)} />
            <button className="send-button" type="submit" disabled={busy || query.trim().length < 2} aria-label="Envoyer la question">{busy ? <span className="spinner" /> : <Send size={18} />}</button>
          </form>
          <p className="research-disclaimer">Sans document pertinent, les réponses viennent des connaissances générales du modèle. Avec des références importées, leurs passages sont cités. Le médecin vérifie et met les informations en contexte.</p>
        </div>
      </div>
    </section>
  );
}
