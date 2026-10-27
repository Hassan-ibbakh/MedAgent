# Model Card — MedAgent

## Usage prévu

Interface de démonstration d’un parcours d’aide à la décision clinique avec supervision du médecin, dont la pathologie cible est la pneumonie communautaire chez l’adulte. Les cas actuellement disponibles sont toutefois fictifs et génériques : ils ne représentent pas des cas de pneumonie et ne sont pas adaptés à son évaluation.

## Agents présents dans le parcours

- **Données cliniques :** règles manuelles sur les constantes vitales.
- **Biologie :** règles manuelles sur des valeurs biologiques synthétiques.
- **Évolution temporelle :** calcul de variations simples sur 72 heures.
- **Imagerie :** `DEMO-005` affiche `test.png` et `test expl.jpeg`, une image associée préexistante. Cette association est uniquement destinée à la démonstration; les données cliniques synthétiques ne sont pas des données confirmées du patient sur la radiographie. Aucune analyse automatisée ou transmission à un modèle n'est effectuée pour cette paire. Une image téléversée manuellement peut être envoyée à un fournisseur multimodal après consentement explicite, mais le modèle généraliste n'est pas validé en radiologie.

Les trois agents disponibles n’ont pas été entraînés sur des données cliniques. Leurs indices et leur synthèse utilisent des seuils illustratifs, sans calibration ni validation sur une cohorte. Ils ne constituent pas une prédiction ou une recommandation médicale.

## Données et limites

Les dossiers sont générés par `data/generate_synthetic.py` et ne représentent aucun patient réel. Ils sont incomplets et ne reproduisent pas la diversité des données cliniques réelles. Aucun usage en soins, diagnostic, triage ou choix thérapeutique n’est prévu.

Le module documentaire extrait le texte des PDF, TXT et Markdown importés, classe les passages avec BM25 et peut utiliser Gemini pour la recherche sémantique et la génération. Le chat peut recevoir séparément un texte de dossier temporaire, relu et confirmé par le médecin, afin de contextualiser la recherche. Les citations ne sont pas intégrées automatiquement à la synthèse clinique. Le module ne vérifie ni l’autorité ni la date des documents; les réponses doivent être confrontées aux sources originales.

## Supervision et validation

Le médecin peut enregistrer une validation, une modification ou un rejet de la synthèse avec un commentaire. Cette action est une démonstration de supervision humaine; le journal est conservé en mémoire et n’est pas une trace médicale durable. Toute utilisation clinique réelle nécessiterait des modèles adaptés au périmètre choisi, des données autorisées et représentatives, une validation indépendante, une analyse des risques, ainsi qu’une gouvernance et une conformité réglementaire appropriées.






## Transparence du RAG

Les indices affiches sont illustratifs sur 100. Ils dependent uniquement des donnees saisies et de regles de demonstration; ils ne sont ni des probabilites ni des scores cliniques valides.

Le statut RAG expose le fournisseur, le mode de recherche et le mode de generation. Avec Gemini configure, les questions, le contexte du dossier et les passages peuvent etre transmis au service distant, meme si la recherche semantique revient a BM25 local. Les identifiants de citation sont controles par rapport aux passages fournis; ce controle ne valide pas la justesse medicale. Sans metadonnees de date ou de version, la source indique "date/version inconnue".
