const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// DS Bot translation inputs';
const inputs = `
${marker}
tasks.configureEach { task ->
    if (task.name.startsWith("createBundle") && task.name.endsWith("JsAndAssets")) {
        task.inputs.files(fileTree("\${projectRoot}/src") { include "**/*.json" })
    }
}
`;

function addInputs(contents) {
  return contents.includes(marker) ? contents : contents + inputs;
}

module.exports = config => withAppBuildGradle(config, config => {
  config.modResults.contents = addInputs(config.modResults.contents);
  return config;
});
module.exports.addInputs = addInputs;
