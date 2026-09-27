// Dynamic config on top of app.json. The only variant switch: APP_VARIANT=rc-local builds a
// release-mode APK that talks to the verified LOCAL backend over adb reverse (G3: zero-cost RC).
// Only that variant may use a plain-HTTP loopback backend (src/cloud/backendUrl.ts).
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'rc-local') return config;
  return {
    ...config,
    extra: { ...(config.extra ?? {}), allowLoopbackBackend: true },
    plugins: [...(config.plugins ?? []), './plugins/withLocalhostCleartext'],
  };
};
