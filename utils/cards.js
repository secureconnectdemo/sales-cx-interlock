const buildSubscriptionPickerCard = (catalog) => ({
  type: "AdaptiveCard",
  version: "1.2", // ⬅️ down from 1.6
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  body: [
    { type: "TextBlock", text: "Select Subscription Type", weight: "Bolder", wrap: true },
    {
      type: "Input.ChoiceSet",
      id: "subscription",
      style: "compact",
      isMultiSelect: false,
      choices: Object.entries(catalog).map(([k, v]) => ({ title: v.label, value: k }))
    }
  ],
  actions: [
    { type: "Action.Submit", title: "Next", data: { formType: "taskSubscriptionSelect" } }
  ]
});

const buildTaskPickerCard = (subscriptionKey, catalog) => {
  const sub = catalog[subscriptionKey];
  return {
    type: "AdaptiveCard",
    version: "1.2", // ⬅️ down from 1.6
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    body: [
      { type: "TextBlock", text: `${sub.label} — Select Tasks`, weight: "Bolder", wrap: true },
      {
        type: "Input.ChoiceSet",
        id: "tasks",
        isMultiSelect: true,   // supported in 1.2
        choices: sub.tasks.map(t => ({ title: t.label, value: t.id }))
      }
    ],
    actions: [
      { type: "Action.Submit", title: "Create Checklist", data: { formType: "taskListSubmit", subscription: subscriptionKey } }
    ]
  };
};
