# Store Build And Release Pipeline

This project is packaged as a single mobile app per platform. The local backend ships inside the app binary, so there is no separate server package for the App Store or Play Store.

## 1. What Is In The Repo

- Expo app config with store identifiers:
  - iOS bundle ID: `com.remotehorizons.meshsocial`
  - Android package: `com.remotehorizons.meshsocial`
- EAS build profiles in `mobile/eas.json`
- GitHub Actions workflow for manual store builds in `.github/workflows/store-build.yml`

## 2. One-Time Setup

### Expo / EAS

From `mobile/`:

```sh
npx eas login
npx eas init
```

`eas init` links the app to an Expo project and writes the EAS project ID into your app config. The GitHub workflow expects that project link to be committed before it can build.

### App Store Connect

Create an iOS app with bundle ID:

```txt
com.remotehorizons.meshsocial
```

### Google Play Console

Create an Android app with package name:

```txt
com.remotehorizons.meshsocial
```

## 3. GitHub Secrets

Add this repository secret:

- `EXPO_TOKEN`

Create it from an Expo account with access to the linked EAS project.

If you later automate store submission, also add store credentials through EAS or GitHub secrets for:

- App Store Connect API key
- Google Play service account JSON

## 4. Local Build Commands

From `mobile/`:

```sh
npx eas build --platform ios --profile production
npx eas build --platform android --profile production
```

For an internal Android test build:

```sh
npx eas build --platform android --profile preview
npx eas build --platform android --profile preview-harbor
npx eas build --platform android --profile preview-mira
```

Preview builds use the non-production app variant and can be distributed internally as test installs.

## 5. GitHub Actions Build

Use the `Store Build` workflow in the GitHub `Actions` tab.

Inputs:

- `platform`: `all`, `ios`, or `android`
- `profile`: `preview` or `production`

The workflow:

1. Checks out the repo
2. Installs Node dependencies
3. Authenticates with Expo using `EXPO_TOKEN`
4. Runs `eas build`

## 6. Submission

Builds produce store-ready artifacts:

- iOS: archive for App Store submission
- Android: AAB for Play Store submission

Submission can be done manually from EAS or added later as a separate workflow:

```sh
npx eas submit --platform ios --profile production
npx eas submit --platform android --profile production
```

## 7. Remaining Gaps Before Real Store Release

- App icons and splash assets
- Privacy policy and store listing copy
- App Store permission review
- Android signing and release track configuration
- Native Rust bridge integration if you replace the JS SQLite adapter
