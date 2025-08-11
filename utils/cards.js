// utils/cards.js

function loadCatalog() {
  const p = path.join(__dirname, "..", "config", "tasksCatalog.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const getSubLabel = (catalog, key) => (catalog[key]?.label || key);

// 1) Subscription picker stays the same
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

// 2) Task picker: same header/instructions for all subs; ONLY the choices change
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
        choices: sub.tasks.map(t => ({ title: t.label, value: t.id }))
      }
    ],
    actions: [
      { type: "Action.Submit", title: "Create Checklist", data: { formType: "taskListSubmit", subscription: subscriptionKey } }
    ]
  };
}

// 3) Checklist message: same title every time; include subscription as a line item
const titleMap = { DNS_DEFENSE: "DNS Defense", SIA: "Secure Internet Access", SPA: "Secure Private Access" };

function buildChecklistMarkdown(subscription, taskIds) {
  const header = "Selected Tasks — Checklist"; // unified header
  const subLine = `**Subscription:** ${titleMap[subscription] || subscription}`;
  const blocks = taskIds.map(id => taskRenderers[id]?.() || `• ${id}`);
  return `### ${header}\n${subLine}\n${blocks.map(b => `\n${b}`).join("\n")}`;
}

module.exports = { loadCatalog, buildSubscriptionPickerCard, buildTaskPickerCard, buildChecklistMarkdown };
