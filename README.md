# Atelier 3D – 2.5D-Anime-Webdemo

[Webdemo öffnen](https://svendo12.github.io/Atelier-3D/)

Die Webdemo startet mit der gezeichneten Atelier-Demonstrationsfigur. Unter **Figur → Animefigur** kannst du auch **Atelier Anime 01**, **Aka** und **Midori** in Vorderansicht wählen. Für Atelier Anime 01 kannst du unter **Kleidung** Bandeau und Slip getrennt schalten. [Rig und Tests](ANIME25D.md) · [Urheber und Lizenz von Aka und Midori](anime25d/models/AKA-MIDORI.md)
Unter **Figur → Darstellungsart** kannst du zur 3D-Gliederpuppe wechseln.
**Pose** enthält die Gelenkregler, 50 Bibliotheksposen und 15 Bewegungen.
Unter **Ansicht** kannst du die projizierten 2D-Gelenke einblenden.
Der PNG-Export verwendet die aktive Ansicht. Projekte lassen sich lokal im Browser speichern und als JSON exportieren.

In der 3D-Ansicht kannst du eigene VRM-Dateien über **Figur** laden.
Die Datei wird im Browser geöffnet. Die Onlinefassung wird als statische Website aus `main` veröffentlicht. Lokal kann sie mit Live Server über `index.html` gestartet werden.

## Technik und Quellen

- [Three.js 0.180.0 (MIT)](https://github.com/mrdoob/three.js/blob/r180/LICENSE)
- [Three-VRM 3.5.0 (MIT)](https://github.com/pixiv/three-vrm/blob/dev/LICENSE)
- [OpenBone 0.4.13 (MIT)](https://github.com/UXCentury/open-bone/blob/main/LICENSE)
- [Quellen der Posen und Bewegungen (CC0)](library/QUELLEN.md)
- Die 2.5D-Demonstrationsfigur ist eine eigene Illustration aus `anime25d/demo-figure.js`.
