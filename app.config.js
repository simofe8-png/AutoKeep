// Dynamic config on top of app.json. The only variant switch: APP_VARIANT=rc-local builds a
// release-mode APK that talks to the verified LOCAL backend over adb reverse (G3: zero-cost RC).
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'rc-local') return config;
  return {
    ...config,
    plugins: [...(config.plugins ?? []), './plugins/withLocalhostCleartext'],
  };
};
