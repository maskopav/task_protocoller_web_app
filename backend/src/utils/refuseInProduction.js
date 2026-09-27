// src/utils/refuseInProduction.js
// runInit.js drops every table and seeds master@test.com with a known password;
// runE2ESeed.js seeds guessable site tokens. Neither may ever touch a live DB.
export function refuseInProduction(scriptName) {
  if (process.env.NODE_ENV === "production") {
    console.error(`❌ ${scriptName} refuses to run with NODE_ENV=production.`);
    process.exit(1);
  }
}
