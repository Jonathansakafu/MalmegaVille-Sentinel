# MalmegaVille Sentinel — Android Companion App

An alternative to a paid cloud SMS gateway (Twilio, etc.): pair an Android phone to your
MalmegaVille Sentinel account, and it relays SMS alerts through that phone's own SIM
whenever the backend needs to reach you by text - no per-message cost, no gateway
account, works in any country.

## How it works

1. Sign in to the app with your dashboard account.
2. The app gets a push token from Firebase Cloud Messaging and registers it with the
   backend (`POST /api/mobile-devices/register`).
3. When an alert-worthy event fires, the backend pushes a silent "send this SMS"
   instruction to every phone paired to that account.
4. The app's background service receives it and sends the text via `SmsManager`, using
   this phone's own SIM - no notification shown, no need to open the app.

This is entirely independent of the Windows agent's own direct-modem SMS fallback
(`windows/CoreService/Services/SmsAlertSender.cs`), which only fires when *the monitored
PC itself* has no internet at all. This app's relay fires whenever the *backend* can
reach the paired phone over the internet - the two cover different scenarios.

## Prerequisites

- A Firebase project (console.firebase.google.com) - free, no card required
- Android Studio, or just a JDK 17 + the Android command-line tools + Gradle (this
  project builds fine from the command line with `./gradlew assembleDebug`, no IDE
  needed)

## Setup

1. In the Firebase console, add an Android app with package name
   `com.malmegaville.sentinel`, and download the `google-services.json` it gives you.
2. Place that file at `android/app/google-services.json` (gitignored - never commit the
   real one; `google-services.json.example` here is a structural placeholder only, not
   a working config).
3. From Project Settings → Service accounts → Generate new private key, download that
   JSON too - this one goes on the **backend**, as `FIREBASE_SERVICE_ACCOUNT_JSON` (see
   `backend/.env.example`), not into this app.
4. Build: `./gradlew assembleDebug`. Output: `app/build/outputs/apk/debug/app-debug.apk`.
5. Install it on an Android phone (enable "install from unknown sources" once) and sign
   in.

## Notes

- Uses `SEND_SMS` and `POST_NOTIFICATIONS` runtime permissions - both requested on first
  launch. Without `SEND_SMS` granted, the relay silently does nothing (by design - see
  `SentinelFirebaseMessagingService.kt`).
- Not published to the Play Store; distributed the same way as the Windows installer,
  as a direct APK download.
- iOS is not supported for this feature: Apple does not allow any app to send SMS
  silently, only via a user-facing compose screen the person has to tap "Send" on
  themselves - see the project's own history/notes for why this scope is Android-only.
