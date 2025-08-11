const fs = require("fs");
const path = require("path");

// load subscription → checklist id map
function loadSubChecklistMap() {
  const p = path.join(__dirname, "..", "config", "subscriptionChecklist.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Unified picker for handoff (same look as /tasks picker)
function buildHandoffSubPickerCard(subMap) {
  return {
    type: "AdaptiveCard",
    version: "1.2",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    body: [
      { type: "TextBlock", text: "Select Subscription Type", weight: "Bolder", wrap: true },
      { type: "TextBlock", text: "We’ll tailor the checklist for this handoff.", isSubtle: true, wrap: true, spacing: "Small" },
      {
        type: "Input.ChoiceSet",
        id: "subscription",
        style: "compact",
        isMultiSelect: false,
        choices: Object.entries(subMap).map(([k, v]) => ({ title: v.label, value: k }))
      }
    ],
    actions: [{ type: "Action.Submit", title: "Next", data: { formType: "handoffSubscriptionSelect" } }]
  };
}

// Trim the base handoff form to only include selected checklist items.
// Works by removing Input.Toggle blocks whose id is NOT in includeIds.
function buildTrimmedHandoffForm(baseFormJson, subKey, subMap) {
  const include = new Set((subMap[subKey]?.includeIds) || []);
  const form = JSON.parse(JSON.stringify(baseFormJson)); // deep clone

  function walk(node) {
    if (!node || typeof node !== "object") return node;

    // remove Toggle inputs not in the include set (only applies to checklist toggles)
    if (node.type === "Input.Toggle" && node.id && node.id.match(/^(pla|con|pol|vis|ope|suc)_/)) {
      return include.has(node.id) ? node : null;
    }

    // recurse common container arrays
    for (const key of ["body", "items", "columns"]) {
      if (Array.isArray(node[key])) {
        node[key] = node[key].map(walk).filter(Boolean);
      }
    }
    // Adaptive Columns have "items" under each column item; handled above
    return node;
  }

  const trimmed = walk(form);
  // update title to include subscription label
  const label = subMap[subKey]?.label || subKey;
  if (trimmed?.body?.length && trimmed.body[0]?.type === "TextBlock") {
    trimmed.body[0].text = `Secure Access Handoff Checklist — ${label}`;
  }

  // ensure submit action carries subscription key back to the bot
  if (trimmed?.actions?.length) {
    trimmed.actions = trimmed.actions.map(a => {
      if (a.type === "Action.Submit") {
        return { ...a, data: { ...(a.data || {}), formType: "secureAccessChecklist", subscription: subKey } };
      }
      return a;
    });
  }
  return trimmed;
}

module.exports = {
  // keep your existing exports…
  loadCatalog,
  buildSubscriptionPickerCard,
  buildTaskPickerCard,
  buildChecklistMarkdown,
  // new ones:
  loadSubChecklistMap,
  buildHandoffSubPickerCard,
  buildTrimmedHandoffForm
};
