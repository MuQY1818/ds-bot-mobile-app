const { withAppBuildGradle } = require('expo/config-plugins');

// Expo's template signs release APKs with the public debug key. Produce an unsigned
// release instead; the build script signs and verifies it with our encrypted key.
function unsignedRelease(contents) {
  const pattern = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s+)signingConfigs\.debug/;
  if (/buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s+null/.test(contents)) return contents;
  if (!pattern.test(contents)) throw new Error('Expo release signing template changed; review signing before building.');
  return contents.replace(pattern, '$1null');
}

module.exports = config => withAppBuildGradle(config, config => {
  config.modResults.contents = unsignedRelease(config.modResults.contents);
  return config;
});
module.exports.unsignedRelease = unsignedRelease;
