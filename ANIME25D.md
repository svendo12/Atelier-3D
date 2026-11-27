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
