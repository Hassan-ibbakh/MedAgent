# Déploiement de MedAgent sur Vercel

Le projet est préparé pour un déploiement Vercel unique : FastAPI traite les routes `/api/*`, et le build React/Vite est servi comme interface web.

## Configuration

- Racine du projet : dossier `MedAgent` (pas `frontend`).
- Commande de build : `npm --prefix frontend ci && npm --prefix frontend run build` (déjà définie dans `vercel.json`).
- Ne téléversez jamais `.env`. Il est ignoré par `.vercelignore`.
- Pour activer les réponses Gemini, ajoutez dans Vercel, dans **Settings → Environment Variables**, `OPENAI_API_KEY` avec votre clé, puis `OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`, `OPENAI_CHAT_MODEL=gemini-2.5-flash` et `OPENAI_EMBEDDING_MODEL=gemini-embedding-2-preview`. Redéployez ensuite.

## Limites de cette version

Cette publication reste une démonstration pédagogique, pas un outil de soin. Les documents ajoutés à la bibliothèque sont enregistrés dans `/tmp` sur Vercel et ne constituent pas un stockage durable; ils peuvent disparaître entre deux exécutions. Les décisions d'exemple et audits sont aussi conservés en mémoire de la fonction. N'importez aucune donnée de patient réelle ou identifiable. Pour un usage partagé, ajouter une authentification, un stockage persistant sécurisé, une politique de confidentialité et une validation clinique est indispensable.

Les fichiers d'imagerie inclus dans `data/demo_patients/` sont des ressources de démonstration validées par le propriétaire du dépôt pour publication.
