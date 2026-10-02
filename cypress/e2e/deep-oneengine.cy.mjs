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
      cy.visit("/");
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

function createFlowOfType(typeLabel) {
  cy.get('button[aria-label="New Flow"]', { timeout: 30000 }).click();
  cy.get('[role="dialog"][aria-label="New Flow"]').should("be.visible");
  cy.contains("button", "Next").click();
  cy.contains("button", typeLabel).click();
  cy.contains("button", "Create").click();
  cy.get(".workflow-builder-header", { timeout: 30000 }).should("be.visible");
}

describe("OneEngine deep deployed E2E", () => {
  beforeEach(() => {
    cy.on("uncaught:exception", (error) => {
      if (/ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i.test(String(error?.message || error))) return false;
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
      const autWindow = $dock[0].ownerDocument.defaultView;
      const gap = autWindow.innerHeight - rect.bottom;
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

  it("Workflow Builder surrounding chrome follows Salesforce-style panes and controls", () => {
    visitAuthenticated("developer/workflow-builder");

    createFlowOfType("Record-Triggered Flow");

    cy.get(".workflow-node-palette", { timeout: 30000 }).should("be.visible").then(($pane) => {
      const style = getComputedStyle($pane[0]);
      expect(style.borderTopLeftRadius).to.equal("0px");
      expect(style.borderTopRightRadius).to.equal("0px");
    });
    cy.get(".workflow-properties-panel").should("be.visible").then(($pane) => {
      const style = getComputedStyle($pane[0]);
      expect(style.borderTopLeftRadius).to.equal("0px");
      expect(style.borderTopRightRadius).to.equal("0px");
      expect(["auto", "scroll"]).to.include(style.overflowY);
    });
    cy.get(".workflow-palette-tabs").should("be.visible");
    cy.get(".workflow-builder-header").then(($bar) => {
      const style = getComputedStyle($bar[0]);
      expect(style.borderTopLeftRadius).to.equal("0px");
      expect(style.boxShadow).to.match(/none|rgba\(0, 0, 0, 0\)/);
    });
    cy.get(".workflow-builder-actions .workflow-cancel-button").first().then(($button) => {
      const style = getComputedStyle($button[0]);
      expect(style.borderTopLeftRadius).to.equal("4px");
      expect(style.height).to.equal("32px");
    });
    cy.contains(".workflow-properties-panel", "Configure Start").should("be.visible");
    cy.contains(".workflow-properties-panel", "Select Object").should("be.visible");
    cy.contains(".workflow-properties-panel", "Configure Trigger").should("be.visible");
    cy.get('.workflow-properties-panel select[aria-label="Flow trigger"]')
      .should("contain.text", "A record is created")
      .and("contain.text", "A record is updated")
      .and("contain.text", "A record is created or updated")
      .and("contain.text", "A record is deleted");
  });

  it("Workflow Builder parity gate: flow type is chosen before Builder and is not editable in Flow Properties", () => {
    visitAuthenticated("developer/workflow-builder");

    createFlowOfType("Record-Triggered Flow");

    cy.get(".workflow-properties-panel", { timeout: 30000 }).should("contain.text", "Configure Start");
    cy.get(".workflow-properties-panel").should("contain.text", "Select Object");
    cy.get(".workflow-properties-panel").should("contain.text", "Trigger the Flow When");

    cy.get('.workflow-builder-header button[aria-label="View Properties"]').click();
    cy.get('[role="dialog"][aria-label="Flow Properties"]').should("be.visible");
    cy.get('[role="dialog"][aria-label="Flow Properties"]').should("not.contain.text", "Flow Type");
  });

  it("Workflow Builder parity gate: button bar and Toolbox follow the Salesforce interaction model", () => {
    visitAuthenticated("developer/workflow-builder");

    createFlowOfType("Record-Triggered Flow");

    cy.get(".workflow-node-palette", { timeout: 30000 }).should("contain.text", "Toolbox");
    cy.get(".workflow-node-palette").should("contain.text", "Elements").and("contain.text", "Manager");

    cy.get(".workflow-builder-header").within(() => {
      cy.contains("button", "Auto-Layout").should("be.visible");
      cy.contains("button", "Debug").should("be.visible");
      cy.contains("button", "Save As").should("be.visible");
      cy.contains("button", "Save").should("be.visible");
      cy.contains("button", "Activate").should("be.visible");
    });
  });

  it("Workflow Builder parity gate: record-triggered Debug uses Setup/Details and preserves triggering-record setup in-session", () => {
    visitAuthenticated("developer/workflow-builder");

    createFlowOfType("Record-Triggered Flow");

    cy.get('.workflow-properties-panel input[aria-label="Search objects"]', { timeout: 30000 })
      .parent()
      .find("select")
      .should(($select) => {
        expect($select.find("option").length).to.be.greaterThan(1);
      })
      .then(($select) => {
        const value = $select.find("option").eq(1).val();
        cy.wrap($select).select(String(value));
      });

    cy.get(".workflow-builder-header").contains("button", "Debug").click();
    cy.get(".workflow-debug-drawer", { timeout: 30000 }).should("be.visible");
    cy.get(".workflow-debug-drawer").should("contain.text", "Setup");
    cy.get(".workflow-debug-drawer").should("contain.text", "Details");

    cy.get(".workflow-debug-drawer").contains("Run the Flow As If the Record Is").parent().find("select").select("updated");
    cy.get(".workflow-debug-drawer").contains("Use a specific triggering record").find('input[type="checkbox"]').check();
    cy.get('.workflow-debug-drawer input[aria-label="Search debug record"]').should("be.visible");

    cy.get(".workflow-debug-drawer").contains("button", "Close").click();
    cy.get(".workflow-builder-header").contains("button", "Debug").click();
    cy.get(".workflow-debug-drawer").contains("Run the Flow As If the Record Is").parent().find("select").should("have.value", "updated");
    cy.get(".workflow-debug-drawer").contains("Use a specific triggering record").find('input[type="checkbox"]').should("be.checked");
  });

  it("Workflow Builder left search and Add Element search use independent state", () => {
    visitAuthenticated("developer/workflow-builder");

    createFlowOfType("Autolaunched Flow (No Trigger)");

    cy.get(".workflow-node-palette", { timeout: 30000 }).should("be.visible");
    cy.get('.workflow-node-palette input[aria-label="Search flow elements"]').clear().type("Assignment");
    cy.get('.workflow-node-palette input[aria-label="Search flow elements"]').should("have.value", "Assignment");

    cy.get('button[aria-label^="Add element after "]').first().click({ force: true });
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
