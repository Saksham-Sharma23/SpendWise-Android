const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Drizzle emits plain .sql migration files. Metro must treat them as assets
// that babel-plugin-inline-import can then inline as strings.
config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, { input: './global.css' });
