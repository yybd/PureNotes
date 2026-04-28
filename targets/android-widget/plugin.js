const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to add an Android Widget.
 */
const withAndroidWidget = (config) => {
  // 1. Add Receiver to AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application[0];
    
    // Ensure we don't add it multiple times
    if (!mainApplication.receiver) {
      mainApplication.receiver = [];
    }
    
    const hasWidget = mainApplication.receiver.some(
      (r) => r.$['android:name'] === 'com.yybd.purenotes.QuickAddWidget'
    );
    
    if (!hasWidget) {
      mainApplication.receiver.push({
        $: {
          'android:name': 'com.yybd.purenotes.QuickAddWidget',
          'android:exported': 'false',
          'android:label': 'PureNotes Quick Add',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/widget_info',
            },
          },
        ],
      });
    }
    
    return config;
  });

  // 2. Copy files to the native project
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidRoot = path.join(projectRoot, 'android');
      
      const resRoot = path.join(androidRoot, 'app/src/main/res');
      const javaRoot = path.join(androidRoot, 'app/src/main/java/com/yybd/purenotes');

      // Ensure directories exist
      fs.mkdirSync(path.join(resRoot, 'layout'), { recursive: true });
      fs.mkdirSync(path.join(resRoot, 'xml'), { recursive: true });
      fs.mkdirSync(path.join(resRoot, 'drawable'), { recursive: true });
      fs.mkdirSync(javaRoot, { recursive: true });

      const targetDir = path.join(projectRoot, 'targets/android-widget');

      // Copy Kotlin file
      fs.copyFileSync(
        path.join(targetDir, 'QuickAddWidget.kt'),
        path.join(javaRoot, 'QuickAddWidget.kt')
      );

      // Copy resources
      fs.copyFileSync(
        path.join(targetDir, 'res/layout/widget_layout.xml'),
        path.join(resRoot, 'layout/widget_layout.xml')
      );
      fs.copyFileSync(
        path.join(targetDir, 'res/xml/widget_info.xml'),
        path.join(resRoot, 'xml/widget_info.xml')
      );
      fs.copyFileSync(
        path.join(targetDir, 'res/drawable/widget_background.xml'),
        path.join(resRoot, 'drawable/widget_background.xml')
      );
      fs.copyFileSync(
        path.join(targetDir, 'res/drawable/ic_edit.xml'),
        path.join(resRoot, 'drawable/ic_edit.xml')
      );

      return config;
    },
  ]);

  return config;
};

module.exports = withAndroidWidget;
