# Atelier 3D – Prototyp 01

Eine kleine, persönliche 3D-Gliederpuppen-Web-App für Windows und später ggf. Grafiktablet.

## Was bereits funktioniert

- 3D-Puppe mit der Maus drehen, zoomen und verschieben
- Körperproportionen und Stil (Anime / neutral) verändern
- Arme, Ellenbogen, Beine und Knie mit Reglern bewegen
- Vier Posen als Ausgangspunkt wählen
- Raster und Gelenkmarkierungen ein- und ausblenden
- PNG der 3D-Ansicht exportieren
- Einstellungen automatisch im Browser speichern und als JSON exportieren/importieren

**Noch nicht enthalten:** Zeichnen mit Grafiktablet, echte importierte Charaktermodelle, Gesichtseditor, Haare oder fein modellierte Hände. Der gesamte Körper besteht derzeit aus einfachen 3D-Grundformen. In der nächsten Ausbaustufe können wir fertige, riggbare GLB-/VRM-Modelle einbinden.

## Auf Windows starten

**Option A – mit Visual Studio Code:** Den Ordner öffnen, die Erweiterung „Live Server“ installieren und `index.html` mit „Open with Live Server“ starten.

**Option B – mit Python (falls installiert):** Terminal in diesem Ordner öffnen und ausführen:

```powershell
py -m http.server 8000
```

Dann `http://localhost:8000` in Chrome oder Edge öffnen.

Nicht nur `index.html` doppelklicken: Für ES-Module ist ein lokaler Webserver zuverlässiger.

Beim ersten Aufruf muss eine Internetverbindung bestehen, weil Three.js von jsDelivr geladen wird.

## Auf GitHub Pages veröffentlichen

1. Ein **öffentliches** GitHub-Repository erstellen, z. B. `atelier-3d`.
2. `index.html`, `style.css`, `app.js` und optional `README.md` in das Stammverzeichnis (Root) des Repositories hochladen.
3. Unter **Settings → Pages → Build and deployment** die Quelle **Deploy from a branch** wählen.
4. Branch `main` und Ordner `/(root)` auswählen und speichern.
5. Die veröffentlichte Web-App ist unter `https://BENUTZERNAME.github.io/atelier-3d/` erreichbar.

**Datenschutz:** Eine mit GitHub Pages veröffentlichte Website ist grundsätzlich öffentlich erreichbar, auch wenn ein bezahlter GitHub-Plan die Bereitstellung aus einem privaten Repository erlaubt. Wenn du die App ausschließlich privat verwenden möchtest, betreibe sie lieber lokal.

## Technischer Aufbau

- Vanilla JavaScript, HTML, CSS
- Three.js mit OrbitControls – importiert als ES-Module via jsDelivr-CDN, Version `0.180.0`
- Keine Datenbank und kein Account nötig
- Projekteinstellungen im Browser-`localStorage`
- Kein npm-Setup oder Build-Schritt notwendig

Lizenzhinweis: Three.js ist MIT-lizenziert. Für zukünftig importierte 3D-Assets müssen wir deren jeweilige Nutzungsbedingungen separat prüfen.

## Bedienung

- **Linke Maustaste + ziehen:** Kamera um die Figur bewegen
- **Mausrad:** Zoomen
- **Rechte Maustaste + ziehen:** Ansicht verschieben
- **Körper:** Größe und Proportionen ändern
- **Gelenke:** Pose individuell einstellen
- **Rechte Seitenleiste:** Pose auswählen oder Einstellungen als JSON sichern

Dies ist ein bewusst einfacher erster Prototyp, noch keine vollständige Zeichensoftware.
