export default {
  projectId: "9qotdd",
  video: true,
  screenshotOnRunFailure: true,
  retries: {
    runMode: 1,
    openMode: 0,
  },
  viewportWidth: 1440,
  viewportHeight: 900,
  defaultCommandTimeout: 12000,
  requestTimeout: 20000,
  responseTimeout: 30000,
  pageLoadTimeout: 60000,
  e2e: {
    baseUrl: process.env.ONEPOS_E2E_BASE_URL || "https://onesolutions-ahuja.github.io/OneEngine/",
    supportFile: false,
    specPattern: "cypress/e2e/**/*.cy.{js,mjs}",
    env: {
      apiBaseUrl: process.env.ONEPOS_E2E_API_BASE_URL || "https://oneengine.onrender.com",
      username: process.env.ONEPOS_E2E_USERNAME || "",
      password: process.env.ONEPOS_E2E_PASSWORD || "",
    },
  },
};
