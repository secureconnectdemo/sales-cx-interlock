// utils/cards.js
const fs = require("fs");
const path = require("path");

// Load subscription → tasks catalog from /config
function loadCatalog() {
  const p = path.join(__dirname, "..", "config", "tasksCatalog.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const getSubLabel = (catalog, key) => (catalog[key]?.label || key);

// Subscription picker (same across subs)
function buildSubscriptionPickerCard(catalog) {
  return {
    type: "AdaptiveCard",
    version: "1.2",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    body: [
      { type: "TextBlock", text: "Select Subscription Type", weight: "Bolder", wrap: true },
      { type: "TextBlock", text: "This sets the task list you’ll see next.", isSubtle: true, wrap: true, spacing: "Small" },
      {
        type: "Input.ChoiceSet",
        id: "subscription",
        style: "compact",
        isMultiSelect: false,
        choices: Object.entries(catalog).map(([k, v]) => ({ title: v.label, value: k }))
      }
    ],
    actions: [{ type: "Action.Submit", title: "Next", data: { formType: "taskSubscriptionSelect" } }]
  };
}

// Task picker (shared header/instructions; only choices change)
function buildTaskPickerCard(subscriptionKey, catalog) {
  const sub = catalog[subscriptionKey];
  return {
    type: "AdaptiveCard",
    version: "1.2",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    body: [
      { type: "TextBlock", text: "Select Tasks", weight: "Bolder", wrap: true },
      { type: "TextBlock", text: "Pick one or more tasks to generate a checklist.", isSubtle: true, wrap: true, spacing: "Small" },
      { type: "FactSet", facts: [{ title: "Subscription", value: getSubLabel(catalog, subscriptionKey) }] },
      {
        type: "Input.ChoiceSet",
        id: "tasks",
        isMultiSelect: true,
        choices: (sub?.tasks || []).map(t => ({ title: t.label, value: t.id }))
      }
    ],
    actions: [{ type: "Action.Submit", title: "Create Checklist", data: { formType: "taskListSubmit", subscription: subscriptionKey } }]
  };
}

// Minimal per-task renderers
const taskRenderers = {
  dns_precheck: () => `**DNS Defense — Pre-check**\n- Confirm Org ID linked\n- Verify Network/VA identities\n- Admin access to dashboard\n- Validate reporting visibility`,
  dns_va: () => `**Deploy Virtual Appliances**\n1) Sizing/prereqs\n2) Deploy VA(s)\n3) Map networks\n4) Validate internal IP visibility`,
  dns_policies: () => `**Baseline Policies**\n- Security + Content categories\n- Allow lists for business apps\n- Rule order & tests`,
  dns_reports: () => `**Reports**\n- Schedule weekly summaries\n- Share to stakeholders\n- Review block hits`,
  sia_root_cert: () => `**Root Cert & HTTPS Decryption**\n- Install root cert\n- Do-Not-Decrypt list\n- Validate categories`,
  sia_web_profiles: () => `**Web Profiles & Rules**\n- Scope profiles\n- Rule ordering\n- Safe tests`,
  sia_file_scan: () => `**File Inspection**\n- Sandbox on\n- Block/monitor\n- Audit logs`,
  sia_activity_search: () => `**Activity Search**\n- Saved searches\n- Alerts`,
  spa_saml: () => `**SPA — SAML**\n- IdP config\n- Claims mapping\n- Test`,
  spa_ipsec: () => `**SPA — IPsec**\n- Edge prereqs\n- Tunnel up\n- Health checks`,
  spa_client: () => `**Secure Client**\n- Modules/profiles\n- Pilot install\n- Posture (scope)`,
  spa_app_segments: () => `**App Segments**\n- Define segments\n- Least-privilege rules\n- Validation`
};

const titleMap = { DNS_DEFENSE: "DNS Defense", SIA: "Secure Internet Access", SPA: "Secure Private Access" };

// Checklist message (uniform header; lists vary)
function buildChecklistMarkdown(subscription, taskIds) {
  const header = "Selected Tasks — Checklist";
  const subLine = `**Subscription:** ${titleMap[subscription] || subscription}`;
  const blocks = (taskIds || []).map(id => taskRenderers[id]?.() || `• ${id}`);
  return `### ${header}\n${subLine}\n${blocks.map(b => `\n${b}`).join("\n")}`;
}

module.exports = {
  loadCatalog,
  buildSubscriptionPickerCard,
  buildTaskPickerCard,
  buildChecklistMarkdown
};
