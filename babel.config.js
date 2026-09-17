module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins: [
      // Lets us `import migrations from "./migrations/migrations"` and, more
      // importantly, inline the generated .sql migration files into the JS
      // bundle. Drizzle's Expo migrator reads them as strings at runtime —
      // this is what makes a schema change ship over EAS Update rather than
      // requiring a native rebuild.
      ['inline-import', { extensions: ['.sql'] }],
      // Must stay last.
      'react-native-worklets/plugin',
    ],
  };
};
