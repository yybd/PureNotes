/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: 'widget',
  name: 'PureNotesWidget',
  bundleIdentifier: 'com.yybd.purenotes.widget',
  entitlements: {
    'com.apple.security.application-groups': [
      `group.${config.ios?.bundleIdentifier || 'com.yybd.purenotes'}`
    ]
  },
  deploymentTarget: '17.0'
});
