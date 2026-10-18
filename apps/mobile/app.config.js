// Cloud push is optional. Signing passwords and server credentials stay out of source.
export default ({ config }) => ({
  ...config,
  plugins: [...(config.plugins || []), "./plugins/withTranslationInputs.cjs", "./plugins/withReleaseBuild.cjs", "./plugins/withLocalPersonalTeam.cjs", "./plugins/withLocalSceneLifecycle.cjs"],
  ios: {
    ...config.ios,
    bundleIdentifier: process.env.DS_BOT_IOS_BUNDLE_ID || config.ios?.bundleIdentifier || 'app.dsbot.mobile',
  },
  android: {
    ...config.android,
    ...(process.env.DS_BOT_ANDROID_VERSION_CODE ? { versionCode: Number(process.env.DS_BOT_ANDROID_VERSION_CODE) } : {}),
    ...(process.env.DS_BOT_GOOGLE_SERVICES_FILE ? {googleServicesFile:process.env.DS_BOT_GOOGLE_SERVICES_FILE} : {}),
  },
  extra: { ...config.extra, ...(process.env.DS_BOT_EAS_PROJECT_ID ? { eas: { projectId: process.env.DS_BOT_EAS_PROJECT_ID } } : {}) },
});
