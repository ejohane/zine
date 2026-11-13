#!/usr/bin/env python3
"""Explicitly copy the native build-4 baseline. No API or database access."""
import json,shutil,subprocess,hashlib
from pathlib import Path
app=Path(__file__).resolve().parents[1]; native=app.parent/'next-ios'; out=app/'src/data'
out.mkdir(exist_ok=True)
for name in ['DevSamples','APIPreview']:
 shutil.copyfile(native/'Resources'/(name+'.json'),out/(name+'.json'))
for item in json.loads((out/'DevSamples.json').read_text()):
 if item.get('image'):
  shutil.copyfile(native/'Resources/Assets.xcassets'/(item['image']+'.imageset')/'photo.jpg',app/'public/artwork'/(item['image']+'.jpg'))
icons=app/'public/icons';icons.mkdir(exist_ok=True)
source=native/'Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png'
for name,size in [('icon-192',192),('icon-512',512),('maskable-512',512),('apple-touch-icon',180)]:
 subprocess.run(['sips','-z',str(size),str(size),str(source),'--out',str(icons/(name+'.png'))],check=True,capture_output=True)
(app/'native-baseline.json').write_text(json.dumps({str(p.relative_to(native)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [native/'Resources/DevSamples.json',native/'Resources/APIPreview.json',native/'Sources/BentoFeed.swift',native/'Sources/NextTheme.swift']},indent=2)+'\n')
print('Synced native metadata, API fixtures, 16 artwork assets, and app icons.')
