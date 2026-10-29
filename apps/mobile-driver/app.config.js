module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    package: "com.medical.driver", // must match the package name in Firebase exactly
    permissions: [
      ...(config.android?.permissions ?? []),
      "android.permission.POST_NOTIFICATIONS",
    ],
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
});