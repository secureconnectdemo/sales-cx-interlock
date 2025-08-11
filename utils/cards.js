// utils/cards.js
const fs = require("fs");
const path = require("path");

// ---- loaders ---------------------------------------------------------------
const loadCatalog = () =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "config", "tasksCatalog.json"), "utf8")
  );

const loadSubChecklistMap = () =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "config", "subscriptionChecklist.json"), "utf8")
  );

// ---- cards: /tasks flow ----------------------------------------------------
const buildSubscriptionPickerCard = (catalog) => ({
  type: "AdaptiveCard",
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  version: "1.2",
  body: [
    { type: "TextBlock", text: "Select Subscription Type", weight: "Bolder", size: "Medium" },
    {
      type: "Input.ChoiceSet",
      id: "subscription",
      style: "compact",
      isMultiSelect: false,
      choices: Object.entries(catalog).map(([key, v]) => ({ title: v.label, value: key }))
    },
    { type: "Input.Text", id: "formType", value: "taskSubscriptionSelect", isVisible: false }
  ],
  actions: [{ type: "Action.Submit", title: "Next" }]
});

const buildTaskPickerCard = (subscription, catalog) => {
  const entry = catalog[subscription];
  const tasks = entry?.tasks || [];
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.2",
    body: [
      { type: "TextBlock", text: `Tasks for ${entry?.label || subscription}`, weight: "Bolder", size: "Medium" },
      {
        type: "Input.ChoiceSet",
        id: "tasks",
        isMultiSelect: true,
        choices: tasks.map(t => ({ title: t.label, value: t.id }))
      },
      { type: "Input.Text", id: "subscription", value: subscription, isVisible: false },
      { type: "Input.Text", id: "formType", value: "taskListSubmit", isVisible: false }
    ],
    actions: [{ type: "Action.Submit", title: "Create Checklist" }]
  };
};

// ---- markdown checklist renderer for /tasks --------------------------------
const buildChecklistMarkdown = (subscription, taskIds) => {
  const catalog = loadCatalog();
  const entry = catalog[subscription] || { label: subscription, tasks: [] };
  const labelById = Object.fromEntries(entry.tasks.map(t => [t.id, t.label]));
  const blocks = taskIds.map(id => `- [ ] ${labelById[id] || id}`);
  return `### ${entry.label} — Checklist\n\n${blocks.join("\n")}`;
};

// ---- cards: /submit handoff flow -------------------------------------------
const buildHandoffSubPickerCard = (subMap) => ({
  type: "AdaptiveCard",
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  version: "1.2",
  body: [
    { type: "TextBlock", text: "Secure Access Handoff — Select Subscription", weight: "Bolder", size: "Medium" },
    {
      type: "Input.ChoiceSet",
      id: "subscription",
      style: "compact",
      isMultiSelect: false,
      choices: Object.entries(subMap).map(([k, v]) => ({ title: v.label || k, value: k }))
    },
    { type: "Input.Text", id: "formType", value: "handoffSubscriptionSelect", isVisible: false }
  ],
  actions: [{ type: "Action.Submit", title: "Next" }]
});

// naive deep clone
const clone = (obj) => JSON.parse(JSON.stringify(obj));

/**
 * Trim the full handoff card to only show checklist items present in includeIds.
 * We hide non-included Input.Toggle items via isVisible=false and add a hidden
 * "subscription" field.
 */
const buildTrimmedHandoffForm = (baseForm, subKey, subMap) => {
  const includeIds = subMap[subKey]?.includeIds || [];
  const card = clone(baseForm);

  // recursive walk to hide Toggle inputs not in includeIds
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== "object") return;

    if (node.type === "Input.Toggle" && node.id && /^((pla|con|pol|vis|ope|suc)_\d+)$/.test(node.id)) {
      if (!includeIds.includes(node.id)) node.isVisible = false;
    }

    // Recurse possible containers
    ["body","items","columns","cards"].forEach(k => {
      if (node[k]) walk(node[k]);
    });
  };

  walk(card);

  // ensure hidden fields exist
  card.body = card.body || [];
  card.body.push({ type: "Input.Text", id: "subscription", value: subKey, isVisible: false });

  // make sure formType is present (some base forms already have it)
  const hasFormType = JSON.stringify(card).includes('"formType":"secureAccessChecklist"');
  if (!hasFormType) {
    card.body.push({ type: "Input.Text", id: "formType", value: "secureAccessChecklist", isVisible: false });
  }

  // lock version to what Webex supports
  card.version = "1.2";
  card.$schema = "http://adaptivecards.io/schemas/adaptive-card.json";
  return card;
};

module.exports = {
  loadCatalog,
  buildSubscriptionPickerCard,
  buildTaskPickerCard,
  buildChecklistMarkdown,
  loadSubChecklistMap,
  buildHandoffSubPickerCard,
  buildTrimmedHandoffForm,
};
