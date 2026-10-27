# MedAgent — aide à la décision clinique

MedAgent présente un parcours de revue multidisciplinaire ciblé sur la pneumonie communautaire chez l’adulte : un dossier est organisé selon quatre familles de données (constantes et signes cliniques, biologie, imagerie et évolution dans le temps), puis une synthèse est soumise à la validation du médecin. Un espace séparé permet de rechercher des passages dans les recommandations et documents médicaux importés.

## État actuel et limites

Le parcours cible la pneumonie communautaire chez l'adulte. Le dossier `DEMO-005` est le cas de démonstration complet : ses données cliniques, biologiques et temporelles sont construites ensemble pour un même patient fictif, et les quatre agents sont exécutés sur ce dossier. `test.png` et `test expl.jpeg` y sont affichées comme paire de visuels préexistants, sans transmission à Gemini. Les valeurs de `DEMO-005` sont synthétiques et ne sont pas les données du patient réel pouvant apparaître dans l’image. Les cas `DEMO-001` à `DEMO-004` restent des exemples distincts. L'image de sortie n'est pas une interprétation médicale. Le mode manuel accepte aussi des données par catégorie; une image téléversée manuellement ne peut être envoyée à un fournisseur multimodal qu'après confirmation explicite. L'application n'est pas sécurisée pour des données patient.

La recherche de références classe les passages des PDF, fichiers TXT et Markdown chargés par l’utilisateur. Le chat peut recevoir séparément le texte extrait d’un dossier patient de démonstration pour contextualiser cette recherche; les citations ne sont pas intégrées automatiquement à la synthèse des agents. Vérifiez chaque passage dans le document d’origine.

## Lancer

Python 3.11+ et Node.js 18+ requis. Depuis la racine, sous PowerShell :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run.ps1
```

Ouvrez http://localhost:5173. L’onglet **Analyse d’un patient** présente les cas synthétiques. L’onglet **Références médicales** permet d’ajouter et de consulter des documents. L’API est disponible à http://localhost:8000/docs.

### Activer Gemini pour le RAG

Dans **Références médicales**, chargez séparément les recommandations de pneumonie communautaire et un dossier fictif/anonymisé (PDF texte, TXT ou Markdown). Le texte du dossier est extrait en mémoire, peut être relu et corrigé, et n’est pas conservé par le serveur. Une fois confirmé, le dossier sert de contexte à la recherche documentaire; si Gemini est actif, son texte, la question et les passages retrouvés sont transmis à Google. Les PDF scannés ne sont pas traités. Cette démonstration n’est pas sécurisée pour des dossiers patients identifiants et ne produit pas de diagnostic ni de prescription.

Le fichier `.env` à la racine est chargé par le backend. Remplacez `OPENAI_API_KEY=` par une clé Gemini obtenue auprès de Google AI Studio, puis relancez le serveur. La génération de réponses et la recherche sémantique utilisent l’API compatible OpenAI de Gemini; sans clé ou si l’API est indisponible, la recherche BM25 locale reste disponible. Les documents envoyés au RAG seront transmis à l’API Gemini lorsque cette configuration est active. N’y ajoutez pas de données personnelles ou médicales.

Pour préparer l’environnement :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
```

Les paquets Python sont isolés dans `.venv`; ceux du frontend sont dans `frontend/node_modules`. Les dossiers de démonstration sont recréés avec `python data/generate_synthetic.py`.

## Documentation

Voir [Description détaillée du projet](docs/DESCRIPTION_PROJET.md), [Architecture](docs/ARCHITECTURE.md), [Model Card](docs/MODEL_CARD.md) et [scénario de démonstration](docs/DEMO_SCRIPT.md). Les jeux de données et l’évaluation nécessaires à des modèles cliniques entraînés ne sont pas fournis dans ce dépôt.
