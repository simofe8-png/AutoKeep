// Dynamic config on top of app.json. Variant switches (APP_VARIANT):
//   rc-local — release-mode APK that talks to the verified LOCAL backend over adb reverse
//              (G3: zero-cost RC). Only this variant may use a plain-HTTP loopback backend.
//   staging  — release-mode APK for the hosted TECHNICAL STAGING project (P2B): separate app id
//              and name so it never mixes with other builds; HTTPS backend only; test data only.
module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT;
  if (variant === 'rc-local') {
    return {
      ...config,
      extra: { ...(config.extra ?? {}), allowLoopbackBackend: true },
      plugins: [...(config.plugins ?? []), './plugins/withLocalhostCleartext'],
    };
  }
  if (variant === 'staging') {
    return {
      ...config,
      name: 'AutoKeep Staging',
      android: { ...(config.android ?? {}), package: 'com.moshenahum.autokeep.staging' },
      ios: { ...(config.ios ?? {}), bundleIdentifier: 'com.autokeep.app.staging' },
      extra: { ...(config.extra ?? {}), variant: 'staging' },
    };
  }
  return config;
};
