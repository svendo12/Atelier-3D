# Atelier Anime 01

Wähle unter **Figur → Darstellungsart → 2.5D-Anime → Animefigur** die **Atelier Anime 01 – Basisfigur**. **Pose → Neutral** stellt die A-Pose her. In **Pose → Oberkörper** kannst du zusätzlich nach vorn oder zur Seite neigen. **Ansicht → 2D-Gelenke anzeigen** zeigt die projizierten Gelenke.

Unter **Kleidung → Basiskleidung** lassen sich **Bandeau** und **Slip** getrennt schalten. Die flache neutrale Grundbekleidung bleibt Teil der Illustration. **Basiskleidung wiederherstellen** blendet beide Originalteile ein. Die Einstellungen gelten für diese Figur und bleiben beim Modellwechsel, beim Neuladen und im JSON-Projekt erhalten.

### Rig und Ebenen

- Die 16 Körpersegmente des eigenen v0.3-Ebenenpakets bilden fünf gemeinsam skinnbare Texturen für Kopf, Hals, Rumpf und Becken sowie je einen Arm und ein Bein. Originale Deckkraft und Farbe an den Schnittkanten bleiben registriert. Die zwei Kleidungs-PNGs haben eigene Slots.
- Die 1024 × 1536 Pixel große Vorlage liefert die Gelenkpunkte. Die Illustrationsseiten L/R werden auf die Vorderansicht des Controllers abgebildet. Die Rumpfachse sitzt an der Taille und der Kopfdrehpunkt an der Kinnlinie. Hals, Handgelenke und Knöchel werden in den Gewichtsfeldern ihrer Nachbarknochen verformt.
- Alle sieben Meshes verwenden dasselbe 12-Pixel-Dreiecksraster mit bis zu vier normierten Knochengewichten pro Vertex. Ein gemeinsames Gewichtsfeld hält Positionen an überlappenden Ebenen gleich. In Ellenbogen und Knien federt ein zusätzlicher, aus beiden Segmentrichtungen berechneter Gelenkrahmen die Bewegung ab. Die Kleidung übernimmt dieselben Gewichte wie die Haut an derselben Position. Arme wechseln mit der projizierten Tiefe ihre Zeichenreihenfolge. Beine liegen am Hüftübergang hinter dem Becken.
- Die neutralen Farbflächen werden vor dem Texturzuschnitt aufgetragen. Die Laufzeitdateien bestehen aus dem Manifest und sieben zugeschnittenen PNGs. Das editierbare ORA, die Referenzdateien und die 13 experimentellen Gelenk-Unterlagen bleiben im ursprünglichen Ebenenpaket.

### Sichtbare Grenzen und zeichnerische Nacharbeit

Bei extremem Überkopfheben können die untere Schulterkontur und die Achsel gestaucht wirken. Sehr kurze Projektionen, etwa ein direkt zur Kamera gerichteter Unterarm, zeigen das Handprofil und die Vorderseite der Illustration übereinander. Tiefe Kniebeugen können die Knie optisch verkürzen und beim Kreuzen überlagern sich ganze Beinteile. Beim starken Vornüberneigen bleiben Gesicht und Körper eine Frontalzeichnung. Die vorhandenen Hinweise werden an der Zeichenfläche angezeigt.

Für weitere Ansichten und Extremposen braucht die Illustration übermalte Achsel- und Hüftübergänge, zusätzliche Konturen an stark gebeugten Ellenbogen und Knien sowie eine von Grund auf schattierte neutrale Körperunterlage. Das Gesicht bleibt als Teil der Kopfzeichnung fest. Zeichnerische Änderungen am Quellpaket können wieder exportiert werden.

```powershell
py -m pip install Pillow
py tools/prepare-atelier-anime-01.py "Pfad zum entpackten Layerpaket" "anime25d/models/atelier-anime-01"
```

### Mit Live Server prüfen

1. Neutral einstellen, die Gelenkpunkte anzeigen und die A-Pose mit der Quellillustration vergleichen.
2. Beide Arme heben und einen Ellenbogen stark beugen. Achseln, Ellenbogen sowie gebeugte Handgelenke prüfen.
3. Ein Knie heben und in die Knie gehen. Anschließend den Oberkörper bei sichtbaren oder ausgeblendeten Kleidungs-Layern nach vorne neigen.
4. Bandeau und Slip einzeln ein- und ausschalten. Figur wechseln, neu laden, JSON exportieren und wieder importieren. Anschließend die Basiskleidung zurücksetzen und ein PNG exportieren.

## Gesicht v0.4 und Haarvorschau v0.5

Wähle **Atelier Anime 01 – Basisfigur** und schalte im Bereich **Figur** die **Haarvorschau v0.5** ein. Die Vorschau ist bei neuen Projekten aus. Die Auswahl wird lokal und in der JSON-Datei gespeichert und ist im PNG sichtbar. Die Haartexturen werden erst beim Laden dieser Figur angefordert. Bei einem fehlenden Haar-Asset zeigt die App die Basisfigur und einen Hinweis.

### Sitz im OpenBone-Rig

Die vier v0.5-PNGs liegen im separaten Verzeichnis [`hair-v05`](anime25d/models/atelier-anime-01/hair-v05/manifest.json). Sie verwenden das Zeichenbrett 1024 × 1536. Die Bilddateien sind auf ihre Alphabereiche zugeschnitten und über `bounds` registriert. Im Manifest steht das Hinterhaar vor dem Körper in der Zeichenreihenfolge. Seitensträhnen und Pony werden über dem Kopf gezeichnet, während die Tiefensortierung Arme weiterhin davor einordnen kann.

Für die neutrale Pose sitzt der Pony 17 Pixel höher, bei 104 % Breite und 92 % Höhe um den Anker `(506, 16)`. Das Hinterhaar sitzt 6 Pixel höher, die Seitensträhnen jeweils 5 Pixel weiter außen und 3 Pixel höher. `L` und `R` gelten aus Sicht der Figur. Alle vier Ebenen folgen dem vorhandenen Kopfknochen. Der Drehpunkt des Rigs liegt an der Kinnlinie bei `(506, 211)`. `(506, 185)` in den Quellmanifesten ist eine Markierung der Illustration.

### Gesicht vorbereiten

Die privaten Ebenensätze `face-v04` und `eyes-v05` enthalten zugeschnittene PNGs, registrierte Grenzen, Knochenreferenzen und Anker. Der v0.4-Referenzkopf stimmt pixelgenau mit dem v0.3-Kopf überein. Bei der Rekonstruktion aus Basis, Brauen, offenen Augen, Nase und Mund bleiben geringe Farbabstände an einzelnen Konturen sichtbar. Für einen späteren Wechsel muss der in der Körpertextur enthaltene Originalkopf gegen die saubere Kopfebene getauscht und der Übergang zu Hals und Kinn mit denselben Gewichten gerendert werden.

### Zeichnerische Korrekturen für die Animation

| Funktion | Was die Zeichnung braucht |
| --- | --- |
| Blinzeln | Augenhöhlen im sauberen Kopf von Hand retuschieren. Je Seite Lidschluss und Zwischenstufen mit zur offenen Form passender Wimpernlinie, Lidfalte und Schattierung zeichnen. Den Übergang zur angrenzenden Haut ohne abgeschnittenen Farbrand prüfen. |
| Blickrichtungen | Gleichmäßiges Augenweiß auch hinter der neutralen Iris zeichnen. Iris und Pupille sauber freistellen und Reflexe als eigene Ebene vorbereiten. Je Auge eine Maske an der tatsächlichen Lidöffnung erstellen. Bei Links-, Rechts-, Hoch- und Tiefblick die dunklen Reste am Irisrand und die Rekonstruktion der Wimpernlinie kontrollieren. |
| Haarbewegung | Ansatz am Scheitel und hinter die sichtbaren Strähnen reichende Überlappungen ausmalen. Lichtkante und Randfarbe von Hinterhaar und Pony aufeinander abstimmen. Lange Strähnen in Ansatz, Mittelstück und Spitzen unterteilen. Bei geneigtem Kopf brauchen Schulter und Nacken getrennte Verdeckungen, bevor sich die Spitzen gewichtet bewegen. |

### Im Browser prüfen

In der A-Pose die Haarvorschau ein- und ausschalten und prüfen, dass Augen und Mund frei bleiben. Den Kopf nach beiden Seiten neigen, drehen, nach vorn und zurück kippen. Anschließend den Oberkörper neigen, **Winken** ausprobieren und ein PNG exportieren. Starke Kopf- und Rumpfdrehungen bleiben eine Projektion der Vorderansicht. Schulterlange Strähnen können bei extremen Kopfneigungen noch in eine Schulter ragen.
