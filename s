{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "Secure Access Handoff Form",
      "wrap": true,
      "weight": "Bolder",
      "size": "Large"
    },
    {
      "type": "Input.Text",
      "id": "customerName",
      "placeholder": "Customer Name",
      "label": "Customer Name"
    },
    {
      "type": "Input.Text",
      "id": "orgId",
      "placeholder": "Organization ID",
      "label": "Org ID"
    },
    {
      "type": "Input.ChoiceSet",
      "id": "pilotStatus",
      "label": "Pilot Status",
      "style": "compact",
      "choices": [
        {
          "title": "\ud83d\udfe2 Good",
          "value": "Good"
        },
        {
          "title": "\ud83d\udfe1 Needs Additional Assistance",
          "value": "Needs Assistance"
        },
        {
          "title": "\ud83d\udd34 At-Risk",
          "value": "At-Risk"
        }
      ]
    },
    {
      "type": "Input.ChoiceSet",
      "id": "risks",
      "label": "Select Adoption Barriers",
      "isMultiSelect": true,
      "style": "expanded",
      "choices": [
        {
          "title": "No internal ownership",
          "value": "No ownership"
        },
        {
          "title": "SAML incomplete",
          "value": "SAML"
        },
        {
          "title": "IPSec tunnel unstable",
          "value": "IPSec"
        },
        {
          "title": "Secure Client not pushed to devices",
          "value": "Secure Client"
        },
        {
          "title": "No test plan",
          "value": "No test plan"
        },
        {
          "title": "DNS leak not fixed",
          "value": "DNS leak"
        },
        {
          "title": "Blocked by other project",
          "value": "Other project"
        },
        {
          "title": "RBI or decryption not enabled",
          "value": "No RBI"
        }
      ]
    },
    {
      "type": "Input.Text",
      "id": "finalScore",
      "label": "Final Score (auto-calculated externally)",
      "placeholder": "e.g. 85"
    },
    {
      "type": "Input.Text",
      "id": "submittedBy",
      "placeholder": "Your Name or Email",
      "label": "Submitted By"
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Submit",
      "data": {
        "formType": "handoff"
      }
    }
  ]
}
