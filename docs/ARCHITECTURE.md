# Architecture

Le frontend React propose un parcours de demonstration pour la pneumonie communautaire adulte, une saisie manuelle par modalite et un espace documentaire separe. Le dossier synthétique `DEMO-005` regroupe des valeurs cliniques, biologiques et temporelles cohérentes entre elles; les quatre agents analysent ce même dossier. Ses visuels `test.png` et `test expl.png` sont associés uniquement à des fins de démonstration : aucun lien clinique réel avec la radiographie n'est affirmé, aucune transmission réseau ni analyse automatisée n'est effectuée. Les cas `DEMO-001` à `DEMO-004` restent des exemples distincts. `/api/analyze/manual` accepte aussi une image PNG/JPEG/WebP (8 Mo maximum) uniquement avec le champ `imaging_consent=true`; dans ce cas, si le fournisseur multimodal est configuré, l'image téléversée est transmise pour une observation exploratoire sans diagnostic ni score.

Le module de synthèse combine les agents disponibles en pondérant leurs indices par confiance, puis calcule une incertitude liée aux désaccords et aux agents indisponibles. Ces opérations sont des règles codées à la main. Aucun modèle n’a été entraîné ou validé sur des données cliniques. Les valeurs résultantes sont uniquement illustratives.

Le médecin peut enregistrer l’acceptation, la modification ou le rejet de la synthèse. Les décisions et analyses restent en mémoire pendant la vie du processus; le stockage n’est ni sécurisé ni durable et ne doit pas être utilisé pour un dossier patient.

## Références médicales

Les routes `/api/research-library` importent, listent et suppriment des PDF, TXT et Markdown sous `data/research_library/`. `pypdf` extrait le texte des PDF et préserve le numéro de page; BM25 classe les passages, avec embeddings et génération Gemini optionnels. `/api/case/extract` extrait temporairement le texte d’un dossier patient sans le stocker. Le chat peut utiliser ce texte comme contexte pour retrouver des passages, mais ne fonde pas automatiquement la synthèse des agents sur les documents importés. Les PDF scannés sans couche texte ne sont pas pris en charge. Le module ne vérifie pas l’actualité ou l’autorité des références.

## Données et sécurité

Les cinq dossiers sous `data/demo_patients/` sont fictifs. Dans `DEMO-005`, les valeurs ont été créées pour former un scénario unique associé visuellement aux images de test; elles ne décrivent pas le patient réel éventuellement représenté sur la radiographie. Ne pas importer de données identifiantes : l’application ne fournit ni authentification, ni contrôle d’accès, ni chiffrement, ni audit durable, ni protection adaptée à un environnement clinique.






Le statut RAG expose les modes de recherche et de generation, et indique si les requetes peuvent etre envoyees a Gemini. Les identifiants [S1], [S2], etc. sont controles par rapport aux passages retournes; ce controle syntaxique ne confirme pas qu'une affirmation est medicalement correcte. Les citations indiquent la page ou le paragraphe et affichent "date/version inconnue" sans metadonnees.
