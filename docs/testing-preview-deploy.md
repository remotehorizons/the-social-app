# Preview Deployment And Test Users

## What exists now

The fastest non-production path in this repo is an internal Expo EAS build.

- `production` keeps the real app identifiers
- `preview` uses preview bundle IDs and package names
- `preview-harbor` and `preview-mira` produce separate installs with different seeded local users

Each preview persona uses its own SQLite database file, so test data does not leak across personas on the same device.

## Supported preview personas

- `you`
- `harbor`
- `mira`

These are controlled by `EXPO_PUBLIC_TEST_PERSONA`.

## Build commands

From `/Users/harrywaine/Documents/New project/mobile`:

```sh
npx eas build --platform ios --profile preview
npx eas build --platform android --profile preview
npx eas build --platform android --profile preview-harbor
npx eas build --platform android --profile preview-mira
```

## Local test commands

For local simulator/device work:

```sh
APP_VARIANT=preview EXPO_PUBLIC_TEST_PERSONA=you npm run start
APP_VARIANT=preview EXPO_PUBLIC_TEST_PERSONA=harbor npm run start
APP_VARIANT=preview EXPO_PUBLIC_TEST_PERSONA=mira npm run start
```

## Important limitation

This is still a local-first prototype. The different users are isolated local personas, not networked accounts backed by a staging server.

That means this setup is good for:

- install testing
- first-session flows
- profile/feed/message behavior
- multi-persona product reviews

It is not yet good for:

- true cross-device sync
- real invitations
- backend-backed staging accounts

## Next step for a real staging environment

To make this behave like a true multi-user staging app, the next build step is invite-based peer exchange backed by either:

1. a lightweight relay/bootstrap service for test accounts, or
2. a deterministic local test harness that can emulate peer replication between devices
