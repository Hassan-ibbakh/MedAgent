"""Fallback hors ligne : prépare des illustrations synthétiques, sans téléchargement."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from data.generate_synthetic import OUT, make_image

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for i in range(1,5):
        make_image(OUT/f'DEMO-{i:03}.png',i)
    print('Aucun jeu public téléchargé. Quatre illustrations factices locales ont été créées.')

if __name__=='__main__': main()
