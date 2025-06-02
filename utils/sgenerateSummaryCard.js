function getRiskLevel(score) {
  if (score >= 90) return { icon: "🟢", label: "Healthy" };
  if (score >= 70) return { icon: "🟡", label: "Monitor" };
  return { icon: "🔴", label: "At Risk" };
}

function generateSummaryCard(inputs) {
  const {
    customerName,
    submittedBy,
    comments,
    adoptionBlockers = "",
    expansionInterests = ""
  } = inputs;

  const totalCheckboxes = Object.entries(inputs).filter(([k, v]) => v === "true").length;
  const score = Math.min(Math.round((totalCheckboxes / 20) * 100), 100); // Adjust 20 if your checklist length changes
  const risk = getRiskLevel(score);

  const followUp = [];
  if (inputs["pol_2"] !== "true") followUp.push("❗ Decryption + Do Not Decrypt Reviewed");

  return {
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.3",
    "body": [
      {
        "type": "Image",
        "url": "https://yourdomain.com/images/secure-access-header.png",
        "size": "Stretch",
        "altText": "Secure Access Banner"
      },
      {
        "type": "TextBlock",
        "text": "✅ **Secure Access Handoff Summary**",
        "weight": "Bolder",
        "size": "Medium",
        "wrap": true
      },
      {
        "type": "TextBlock",
        "text": `- **Customer Name:** ${customerName}\n- **Submitted By:** [${submittedBy}](mailto:${submittedBy})\n- **Score:** ${score}/100\n- **Risk Level:** ${risk.icon} ${risk.label}`,
        "wrap": true
      },
      {
        "type": "TextBlock",
        "text": `🛠️ **Items Requiring Follow-Up:**\n${followUp.join('\n') || "✅ None"}`,
        "wrap": true
      },
      {
        "type": "TextBlock",
        "text": `🔍 **Adoption Blockers:**\n${adoptionBlockers.split(',').map(i => `- ${i}`).join('\n') || "✅ None"}`,
        "wrap": true
      },
      {
        "type": "TextBlock",
        "text": `📈 **Customer Interested in Exploring:**\n${expansionInterests.split(',').map(i => `- ${i}`).join('\n') || "None"}`,
        "wrap": true
      },
      {
        "type": "TextBlock",
        "text": `💬 **Additional Comments:**\n${comments || "None"}`,
        "wrap": true
      }
    ],
    "actions": [
      {
        "type": "Action.OpenUrl",
        "title": "🔗 View Full Onboarding Record",
        "url": `https://yourcrm.com/onboarding/${encodeURIComponent(customerName)}`
      }
    ]
  };
}

module.exports = generateSummaryCard;
