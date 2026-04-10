import type { ExpoConfig } from "expo/config";

const appVariant = process.env.APP_VARIANT ?? "production";
const suffix = appVariant === "production" ? "" : ` ${appVariant.toUpperCase()}`;
const idSuffix = appVariant === "production" ? "" : `.preview`;

const config: ExpoConfig = {
  name: `MeshSocial${suffix}`,
  slug: "meshsocial",
  version: "0.1.0",
  scheme: appVariant === "production" ? "meshsocial" : "meshsocial-preview",
  orientation: "portrait",
  platforms: ["ios", "android"],
  ios: {
    bundleIdentifier: `com.remotehorizons.meshsocial${idSuffix}`,
    buildNumber: "1"
  },
  android: {
    package: `com.remotehorizons.meshsocial${idSuffix}`,
    versionCode: 1
  },
  extra: {
    appVariant,
    testPersona: process.env.EXPO_PUBLIC_TEST_PERSONA ?? "you"
  },
  assetBundlePatterns: ["**/*"]
};

export default config;
