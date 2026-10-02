const ROUTES = [
  "dashboard",
  "till",
  "sales",
  "products",
  "inventory",
  "purchases",
  "suppliers",
  "customers",
  "reports",
  "settings/security-identity",
  "settings/security-governance",
  "settings/data-protection",
  "developer/objects",
  "developer/workflow-builder",
  "developer/approval-builder",
  "developer/page-builder",
  "developer/dashboard-builder",
  "developer/report-builder",
  "developer/workflow-runs",
  "developer/work-items",
  "developer/platform-apps",
  "developer/deployments",
];

function credentials() {
  return {
    username: Cypress.env("username"),
    password: Cypress.env("password"),
  };
}

function login() {
  const { username, password } = credentials();
  if (!username || !password) {
    throw new Error("Cypress E2E credentials are missing. Configure ONEPOS_PLAYWRIGHT_USERNAME and ONEPOS_PLAYWRIGHT_PASSWORD GitHub variables.");
  }

  cy.session(["oneengine-e2e", username], () => {
    cy.visit("/");
    cy.get('input[placeholder="Email or username"]', { timeout: 30000 }).should("be.visible").clear().type(username, { log: false });
    cy.get('input[placeholder="Password"]').clear().type(password, { log: false });
    cy.contains("button", /^Sign In$/).click();

    cy.get('input[placeholder="Email or username"]', { timeout: 30000 }).should("not.exist");
    cy.window().then((win) => {
      const token = win.sessionStorage.getItem("onepos_token") || win.localStorage.getItem("onepos_token");
      expect(token, "issued onepos auth token").to.be.a("string").and.not.be.empty;
    });
  }, {
    validate() {
      cy.window().then((win) => {
        const token = win.sessionStorage.getItem("onepos_token") || win.localStorage.getItem("onepos_token");
        expect(token, "restored onepos auth token").to.be.a("string").and.not.be.empty;
      });
    },
    cacheAcrossSpecs: true,
  });
}

function assertNoHorizontalOverflow() {
  cy.document().then((doc) => {
    const root = doc.documentElement;
    expect(root.scrollWidth, "document horizontal overflow").to.be.at.most(root.clientWidth + 2);
  });
}

function assertNoFatalPageText() {
  cy.get("body").invoke("text").then((bodyText) => {
    expect(bodyText).not.to.match(/Application error|Something went wrong|OneEngine service is unavailable|could not complete a database migration/i);
  });
}

function visitAuthenticated(path) {
  login();
  cy.visit(path);
  cy.get("body", { timeout: 30000 }).should("be.visible");
  assertNoFatalPageText();
}

describe("OneEngine deep deployed E2E", () => {
  beforeEach(() => {
    cy.on("uncaught:exception", (error) => {
      throw error;
    });
  });

  it("authenticates against the deployed OneEngine application", () => {
    login();
    cy.visit("dashboard");
    cy.contains("Business Overview", { timeout: 30000 }).should("be.visible");
  });

  for (const route of ROUTES) {
    it(`route audit: ${route}`, () => {
      visitAuthenticated(route);
      cy.wait(250);
      assertNoHorizontalOverflow();
    });
  }

  it("dashboard uses the Smart Theme black clock and dock is 6px from viewport bottom", () => {
    visitAuthenticated("dashboard");

    cy.get('.dashboard-card--smart-clock', { timeout: 30000 }).should("be.visible").then(($clock) => {
      const style = getComputedStyle($clock[0]);
      expect(style.backgroundImage, "black Smart Theme clock background").not.to.equal("none");
      expect(style.color || getComputedStyle($clock.find(".dashboard-smart-clock")[0]).color).to.exist;
    });

    cy.get(".dock-zone:visible").first().then(($dock) => {
      const rect = $dock[0].getBoundingClientRect();
      const gap = window.innerHeight - rect.bottom;
      expect(gap, "dock bottom gap").to.be.within(4, 8);
    });
  });

  it("OneDeveloper client selector is a real selectable control and wasted page-title strip is removed", () => {
    visitAuthenticated("developer/objects");

    cy.get(".oneengine-client-selector-control select", { timeout: 30000 })
      .should("be.visible")
      .and("not.be.disabled");

    cy.get(".onedeveloper-page .settings-content-header").should("not.exist");
  });

  it("workflow list groups start collapsed, expand independently, and header/search stay sticky", () => {
    visitAuthenticated("developer/workflow-builder");

    cy.get(".onebuilder-workflow-group-head", { timeout: 30000 }).should("have.length.greaterThan", 0);
    cy.get(".onebuilder-workflow-group-head").each(($group) => {
      expect($group.attr("aria-expanded")).to.equal("false");
    });

    cy.get(".onebuilder-list-header").then(($header) => {
      expect(getComputedStyle($header[0]).position).to.equal("sticky");
    });
    cy.get(".onebuilder-list-search").then(($search) => {
      expect(getComputedStyle($search[0]).position).to.equal("sticky");
    });

    cy.get(".onebuilder-workflow-group-head").first().click().should("have.attr", "aria-expanded", "true");
    cy.get(".onebuilder-workflow-group.is-expanded .onebuilder-list-row").should("have.length.greaterThan", 0);
  });

  it("Workflow Builder left search and Add Element search use independent state", () => {
    visitAuthenticated("developer/workflow-builder");

    cy.get(".onebuilder-workflow-group-head").first().click();
    cy.get(".onebuilder-workflow-group.is-expanded .onebuilder-list-row").first().click();

    cy.get(".workflow-node-palette", { timeout: 30000 }).should("be.visible");
    cy.get('.workflow-node-palette input[aria-label="Search flow elements"]').clear().type("Assignment");
    cy.get('.workflow-node-palette input[aria-label="Search flow elements"]').should("have.value", "Assignment");

    cy.get(".workflow-insert-button").first().click({ force: true });
    cy.get(".workflow-add-element-popover", { timeout: 10000 }).should("be.visible");
    cy.get(".workflow-add-element-search input").should("have.value", "").type("Decision");
    cy.get('.workflow-node-palette input[aria-label="Search flow elements"]').should("have.value", "Assignment");
    cy.get(".workflow-add-element-search input").should("have.value", "Decision");
  });

  it("Workflow Builder properties panel has independent scrolling and working field selectors", () => {
    visitAuthenticated("developer/workflow-builder");

    cy.get(".onebuilder-workflow-group-head").first().click();
    cy.get(".onebuilder-workflow-group.is-expanded .onebuilder-list-row").first().click();

    cy.get(".workflow-properties-panel", { timeout: 30000 }).should("be.visible").then(($panel) => {
      const style = getComputedStyle($panel[0]);
      expect(["auto", "scroll"]).to.include(style.overflowY);
    });

    cy.get(".workflow-properties-panel select:visible").then(($selects) => {
      expect($selects.length, "visible property selectors").to.be.greaterThan(0);
    });
  });

  it("workflow action registry exposes communication and connector actions to the builder", () => {
    login();
    cy.window().then((win) => {
      const token = win.sessionStorage.getItem("onepos_token") || win.localStorage.getItem("onepos_token");
      expect(token).to.be.a("string").and.not.be.empty;
      cy.request({
        url: `${Cypress.env("apiBaseUrl").replace(/\/$/, "")}/api/platform/workflow-actions`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((response) => {
        expect(response.status).to.equal(200);
        const actions = Array.isArray(response.body?.data) ? response.body.data : [];
        const keys = actions.map((item) => String(item.key || ""));
        expect(keys).to.include("SEND_EMAIL");
        expect(keys).to.include("SEND_SMS");
        expect(keys.some((key) => key.startsWith("CONNECTOR_") || key.startsWith("PAYMENT_") || key.startsWith("PRINT_")), "connector-backed action available").to.equal(true);
      });
    });
  });

  it("dock Jarvis separator and surround follow the requested geometry", () => {
    visitAuthenticated("dashboard");

    cy.get(".dock-fixed-zone .dock-separator:visible").first().then(($separator) => {
      const sep = $separator[0].getBoundingClientRect();
      const zone = $separator[0].parentElement.getBoundingClientRect();
      const topGap = sep.top - zone.top;
      const bottomGap = zone.bottom - sep.bottom;
      expect(Math.abs(topGap - bottomGap), "balanced Jarvis divider").to.be.at.most(2);
    });

    cy.get(".dock-jarves-slot .jarvis-orb-container:visible").should("exist");
  });
});
