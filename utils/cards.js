const fs = require("fs");
const path = require("path");

// 🔧 point to /config/tasksCatalog.json (not /data)
const loadCatalog = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "tasksCatalog.json"), "utf8"));

const buildSubscriptionPickerCard = (catalog) => ({
  type: "AdaptiveCard", version: "1.6", $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  body: [
    { type: "TextBlock", text: "Select Subscription Type", weight: "Bolder", size: "Medium" },
    {
      type: "Input.ChoiceSet", id: "subscription", style: "compact", isMultiSelect: false,
      choices: Object.entries(catalog).map(([k, v]) => ({ title: v.label, value: k }))
    }
  ],
  actions: [{ type: "Action.Submit", title: "Next", data: { formType: "taskSubscriptionSelect" } }]
});

const buildTaskPickerCard = (subscriptionKey, catalog) => {
  const sub = catalog[subscriptionKey];
  return {
    type: "AdaptiveCard", version: "1.6", $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    body: [
      { type: "TextBlock", text: `${sub.label} — Select Tasks`, weight: "Bolder", size: "Medium" },
      { type: "Input.ChoiceSet", id: "tasks", isMultiSelect: true,
        choices: sub.tasks.map(t => ({ title: t.label, value: t.id })) }
    ],
    actions: [{ type: "Action.Submit", title: "Create Checklist", data: { formType: "taskListSubmit", subscription: subscriptionKey } }]
  };
};

const taskRenderers = {
  // ...same renderers we discussed earlier...
};

const titleMap = { DNS_DEFENSE: "DNS Defense", SIA: "Secure Internet Access", SPA: "Secure Private Access" };

const buildChecklistMarkdown = (subscription, taskIds) => {
  const blocks = taskIds.map(id => taskRenderers[id]?.() || `• ${id}`);
  return `### ${titleMap[subscription] || subscription} — Checklist\n${blocks.map(b => `\n${b}`).join("\n")}`;
};

module.exports = { loadCatalog, buildSubscriptionPickerCard, buildTaskPickerCard, buildChecklistMarkdown };

