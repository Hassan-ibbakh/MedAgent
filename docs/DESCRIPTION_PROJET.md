# MedAgent — description détaillée du projet

## 1. Présentation

MedAgent est une application web de démonstration d’un parcours d’aide à la décision médicale. Son périmètre de travail est la pneumonie communautaire chez l’adulte. Elle réunit deux fonctions complémentaires : une analyse illustrative de données patient par quatre agents spécialisés et un assistant documentaire qui rapproche un dossier textuel des recommandations importées.

Le médecin reste responsable de l’interprétation et de toute décision. L’application ne remplace pas l’examen clinique, le jugement professionnel ni la consultation des documents d’origine.

## 2. Objectifs de la démonstration

- Montrer comment différents types de données patient peuvent être examinés séparément.
- Faire apparaître une synthèse commune des sorties disponibles et de leurs limites.
- Illustrer une étape de supervision humaine où le médecin peut valider, modifier ou rejeter une synthèse.
- Permettre la consultation de recommandations médicales avec des citations de passages.
- Montrer comment le texte d’un dossier fictif ou anonymisé peut contextualiser la recherche documentaire.

## 3. Parcours médecin

### A. Analyse multidisciplinaire

Le médecin peut sélectionner l’un des dossiers synthétiques fournis ou créer un cas en saisissant les données par catégorie. Les entrées manuelles comprennent :

- **Données cliniques :** fréquence respiratoire, saturation en oxygène, température, fréquence cardiaque et pression systolique.
- **Biologie :** CRP, leucocytes, lactate, procalcitonine et créatinine.
- **Évolution temporelle :** mesures répétées de la fréquence respiratoire, de la saturation et de la CRP, avec un temps associé à chaque point.
- **Imagerie :** compte rendu textuel facultatif et aperçu local d’une image.

Chaque catégorie est traitée par l’agent correspondant. Les catégories absentes sont signalées comme indisponibles plutôt que remplacées par des valeurs supposées.

### B. Les quatre agents

1. **Agent clinique** : applique des seuils codés à la main aux constantes disponibles.
2. **Agent biologique** : compare certaines valeurs de laboratoire à des seuils illustratifs.
3. **Agent temporel** : calcule les variations entre observations, par exemple sur plusieurs heures.
4. **Agent d'imagerie** : le cas complet `DEMO-005` associe les valeurs cliniques, biologiques et temporelles d'un scénario synthétique unique aux images locales `test.png` (entrée) et `test expl.png` (visuel associé déjà fourni). Cette association sert au test de l'interface; elle ne prétend pas que les valeurs fictives appartiennent au patient réel représenté sur l'image. Aucun fichier de cette paire n'est envoyé à Gemini. Une image téléversée manuellement peut être envoyée après consentement explicite pour une observation descriptive exploratoire, sans score ni diagnostic.

Les trois premiers agents utilisent des règles simples. Aucun de ces agents ne correspond à un modèle entraîné ou validé cliniquement.

### C. Synthèse et revue médicale

Les sorties disponibles sont réunies dans une synthèse qui affiche un indice illustratif, un niveau de vigilance, une estimation de l’incertitude et les principaux éléments ayant contribué au résultat. Les poids et seuils configurés se trouvent dans `config.yaml`.

Le médecin peut ensuite enregistrer une validation, une modification ou un rejet, avec un commentaire facultatif. Ce journal n’existe qu’en mémoire pendant l’exécution du backend; il n’est pas durable.

### D. Assistant documentaire avec contexte patient

L’espace **Références médicales** sert à deux types d’imports distincts :

- **Documents de référence** : recommandations, guides et articles PDF, TXT ou Markdown. Ils sont conservés localement dans `data/research_library/` jusqu’à leur suppression.
- **Dossier patient de démonstration** : fichier PDF textuel, TXT ou Markdown. Le backend en extrait le texte, sans enregistrer le fichier ou le texte. Le médecin peut relire, corriger et anonymiser l’extrait avant de confirmer son usage.

Après confirmation, le chat utilise le dossier comme contexte pour chercher des passages pertinents dans les documents de référence. Une question préremplie propose de demander quels passages sont à considérer et quels éléments restent à vérifier. Les réponses générées citent les sources sous la forme `[S1]`, `[S2]`, etc.; le médecin doit contrôler ces passages dans le document d’origine.

Le chat peut résumer et mettre en regard les recommandations citées avec les éléments du dossier. Il ne pose pas de diagnostic et ne prescrit pas de traitement. Il peut signaler que les documents importés ne suffisent pas à répondre.

Les PDF scannés sans couche de texte ne sont pas reconnus : aucun OCR n’est installé. Le texte extrait est limité à 16 000 caractères dans le contexte du chat; un indicateur prévient si l’extrait a été tronqué.

## 4. Recherche RAG et génération

Le RAG (génération augmentée par récupération) suit ces étapes :

1. Le texte des documents de référence est découpé en passages avec les repères de page ou de paragraphe.
2. La question, le contexte de pneumonie communautaire adulte et, s’il est fourni, le texte anonymisé du dossier orientent la recherche.
3. Les passages les plus pertinents sont sélectionnés dans la bibliothèque documentaire et transmis au générateur avec la question.
4. La réponse est affichée avec les extraits et leurs sources.

Quand Gemini est configuré, le backend utilise l’API Google compatible OpenAI pour les embeddings et la génération. Sans clé, ou si la recherche sémantique échoue, il utilise BM25 local; si aucun générateur n’est disponible, l’application affiche les extraits récupérés sans synthèse générée. Ollama peut aussi être configuré comme option locale de génération.

Les documents importés ne sont pas automatiquement certifiés comme recommandations faisant autorité ou à jour. Il revient au médecin de sélectionner des sources appropriées et de vérifier chaque citation.

## 5. Architecture technique

| Partie | Technologies et rôle |
|---|---|
| Interface web | React, TypeScript, Vite, Recharts et Lucide; saisie, résultats des agents, graphiques, chat et revue médecin. |
| API | FastAPI et Pydantic; validation des entrées, exécution des agents, extraction PDF, chat documentaire et journal de démonstration. |
| Agents | Python; règles cliniques, biologiques et temporelles illustratives, plus observation multimodale exploratoire facultative pour la radiographie de démonstration. |
| Recherche documentaire | Extraction avec `pypdf`, recherche BM25 locale et embeddings Gemini optionnels. |
| Données de démonstration | Dossiers JSON et images synthétiques sous `data/demo_patients/`. |
| Configuration | `config.yaml` pour les poids/seuils; `.env` pour les paramètres du fournisseur de modèle. |

### Routes API principales

- `GET /api/health` : état du backend.
- `GET /api/patients` et `GET /api/patients/{pid}` : liste et lecture des cas synthétiques.
- `POST /api/analyze/{pid}` : analyse d’un cas synthétique.
- `POST /api/analyze/manual` : analyse de données saisies manuellement.
- `POST /api/decisions` : enregistrement d’une décision de démonstration.
- `POST /api/case/extract` : extraction temporaire du texte d’un dossier PDF/TXT/Markdown.
- `GET/POST/DELETE /api/research-library` : gestion des documents de référence.
- `GET /api/rag/status` : fournisseur de chat actif et indication d’envoi distant.
- `POST /api/chat` : recherche et réponse documentaire, éventuellement contextualisées par un dossier.

## 6. Configuration de Gemini

Le fichier `.env` à la racine contient les paramètres suivants :

```dotenv
OPENAI_API_KEY=ta_cle_gemini
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
OPENAI_CHAT_MODEL=gemini-2.5-flash
OPENAI_EMBEDDING_MODEL=gemini-embedding-2-preview
```

La clé doit rester dans `.env`, qui est ignoré par Git. Après modification, redémarrer le backend. L’interface indique quand le mode Gemini est actif.

Lorsque Gemini est actif, la question, le dossier fourni et les passages documentaires récupérés sont envoyés à Google pour la recherche et la génération. Le médecin doit donc utiliser uniquement des dossiers fictifs ou anonymisés dans cette démonstration.

## 7. Lancement local

Depuis la racine du projet, sous PowerShell :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
powershell -ExecutionPolicy Bypass -File scripts/run.ps1
```

Puis ouvrir `http://localhost:5173`. La documentation interactive de l’API FastAPI est disponible à `http://localhost:8000/docs`.

## 8. Limites et usage prévu

MedAgent est un prototype de démonstration logicielle. Les cas fournis sont synthétiques et génériques; ils ne constituent pas des cas de pneumonie validés. Les scores reposent sur des règles faites à la main, ne sont ni entraînés ni évalués sur une cohorte clinique, et ne doivent pas guider des soins.

L’application ne fournit pas d’authentification, de contrôle d’accès, de chiffrement clinique, d’audit durable ou de mécanisme de conformité aux exigences d’un établissement de santé. Ne pas y charger de dossiers réels identifiants. Les sorties du chat dépendent des documents importés et du fournisseur de modèle configuré; elles doivent être vérifiées dans les sources originales.

## 9. Évolutions nécessaires avant un usage clinique

- Définir avec des médecins le périmètre clinique et les décisions effectivement soutenues.
- Sélectionner des recommandations fiables, datées et versionnées; gérer leurs mises à jour.
- Construire des jeux de données autorisés et représentatifs, puis entraîner ou sélectionner des modèles adaptés.
- Évaluer indépendamment les performances, les erreurs, les biais et l’incertitude.
- Ajouter une infrastructure de sécurité, de confidentialité, de gestion des accès, de journalisation et de gouvernance adaptée.
- Tester le parcours complet avec des cliniciens et établir les règles d’utilisation, de surveillance et de maintenance.
