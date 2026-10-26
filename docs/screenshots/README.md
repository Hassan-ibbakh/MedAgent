# Captures du parcours de démonstration

Les captures PNG sont produites depuis l'interface locale avec Chromium via Playwright. Après démarrage de l'API et de Vite (`scripts/run.ps1`), exécuter depuis `frontend/` :

```powershell
npm.cmd run capture:screenshots
```

Le script utilise Edge installé sur Windows; définir `MEDAGENT_BROWSER` si le binaire Chromium/Chrome est ailleurs.
