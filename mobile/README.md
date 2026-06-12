# LETW Mobile

This Expo application packages the invitation-only LETW collaboration experience for Android and iOS and registers Expo push tokens through the authenticated web session.

1. Install Expo/EAS: `npm install --global eas-cli`
2. In this folder run `npm install`
3. Run `eas init` and replace `REPLACE_WITH_EXPO_PROJECT_ID` in `app.json`
4. Set `EXPO_PUBLIC_LETW_URL=https://sharepoints.letw.org`
5. Test on a physical phone with `npm start`
6. Build installable apps with `eas build --platform android` and `eas build --platform ios`
