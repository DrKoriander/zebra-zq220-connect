# Zebra ZQ220 Bluetooth Kopplung

React Native App zum automatischen Koppeln eines Zebra ZQ220 Druckers mit Zebra TC22/TC26 Android-Geräten.

## Problem

Das Koppeln des ZQ220 mit Android-Geräten schlägt häufig fehl, weil Android den SSP "Just Works"-Modus inkonsistent behandelt (Bestätigungsdialog erscheint manchmal nur als Notification oder gar nicht → Timeout).

## Lösung

1. **App**: Natives Android-Modul das `ACTION_PAIRING_REQUEST` abfängt und automatisch per PIN bestätigt
2. **Drucker**: ZQ220 auf PIN-basiertes Pairing umstellen (Security Mode 2)

## Drucker-Konfiguration

**Einmalig** über Zebra Setup Utilities oder direkt per Bluetooth senden:

```
! U1 setvar "bluetooth.minimum_security_mode" "2"
! U1 setvar "bluetooth.authentication" "setpin"
! U1 setvar "bluetooth.bluetooth_pin" "0000"
```

Diese Befehle stellen den ZQ220 auf PIN-basiertes Pairing um.

## Entwicklung

```bash
npm install
npm start
npm run android   # App auf verbundenem Gerät starten
```

## APK Release erstellen

Die APK wird automatisch über GitHub Actions gebaut:

1. Commit & Push auf `main`
2. Tag erstellen und pushen:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. APK erscheint unter [Releases](https://github.com/DrKoriander/zebra-zq220-connect/releases/)

## Nutzung

1. ZQ220 einschalten
2. App öffnen → Bluetooth-Berechtigungen erteilen
3. "Drucker suchen" drücken
4. ZQ220 in der Liste antippen → "Koppeln"
5. Kopplung erfolgt automatisch mit PIN 0000

## Technische Details

- React Native 0.83
- Min Android SDK 26 (Android 8.0)
- Zielgeräte: Zebra TC22/TC26 (Android 13)
- Native Kotlin BroadcastReceiver für `ACTION_PAIRING_REQUEST`
- Unterstützt SSP PIN, Passkey Confirmation und Consent Varianten
