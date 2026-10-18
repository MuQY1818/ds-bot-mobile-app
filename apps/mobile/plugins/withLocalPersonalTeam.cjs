// Personal Team builds cannot provision APNs; keep this local build reproducible.
const { withEntitlementsPlist } = require('expo/config-plugins');
module.exports = function withLocalPersonalTeam(config) {
  return withEntitlementsPlist(config, config => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
