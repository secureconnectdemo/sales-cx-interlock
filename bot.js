const Airtable = require("airtable");
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base("appG1ZNhb2KRKQQOI");

const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
let BOT_PERSON_ID = "";

const STRATEGIC_CSS_ROOM_ID = "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1";

const formMap = {
  deployment: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")),
  picker: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8")),
  handoff: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "secureAccessHandoffForm.json"), "utf8"))
};

app.get("/test", (req, res) => {
  res.send("✅ SSE-CX-Hub bot is up and running");
});

app.post("/webhook", async (req, res) => {
  console.log("🔥 Incoming webhook hit");
  const { data, resource } = req.body;
  const roomId = data?.roomId;
  const roomType = data?.roomType;
  const messageId = data?.id;

  if (!roomId || !messageId) return res.sendStatus(400);

  try {
    if (resource === "messages") {
      const messageRes = await axios.get(`https://webexapis.com/v1/messages/${messageId}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });

      if (messageRes.data.personId === BOT_PERSON_ID) {
        console.log("🛑 Ignoring bot's own message");
        return res.sendStatus(200);
      }

      const rawText = messageRes.data.text || "";
      const lines = rawText
        .split("\n")
        .map(line => line.trim().toLowerCase())
        .filter(line => line.length > 0);

      const mentioned = (data?.mentionedPeople || []).some(id => id.toLowerCase() === BOT_PERSON_ID.toLowerCase());
      const isDirect = roomType === "direct";

      if (!mentioned && !isDirect) return res.sendStatus(200);

      let commandRecognized = false;

      for (const line of lines) {
        if (commandRecognized) break;

        if (line === "/submit deployment") {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: "📝 Opening the **Secure Access Deployment Form**...\n\n⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*"
          }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
          await sendForm(roomId, "deployment");
          commandRecognized = true;
        }

        if (line === "/submit handoff") {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: "📋 Opening the **Secure Access Handoff Form**...\n\n⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*"
          }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
          await sendForm(roomId, "handoff");
          commandRecognized = true;
        }

        if (line === "/help") {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: `
🤖 **SSE-CX-Hub Bot – Help Menu**
\`/submit deployment\` – Open Deployment Form  
\`/submit handoff\` – Open Handoff Checklist  
\`/reset\` – (Coming Soon)  
Contact: josfonse@cisco.com`
          }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
          commandRecognized = true;
        }

        if (line === "/reset") {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: "🔄 Reset acknowledged. (Coming soon.)"
          }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
          commandRecognized = true;
        }
      }

      if (!commandRecognized) {
        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: "⚠️ Unknown command. Type \`/help\` for options."
        }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
      }

      return res.sendStatus(200);
    }

    if (resource === "attachmentActions") {
      console.log("📩 Attachment Action Triggered");

      try {
        const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
          headers: { Authorization: WEBEX_BOT_TOKEN }
        });

        const formData = actionRes.data.inputs;
        console.log("📝 Processing form submission:", formData);

        if (formData?.formType === "secureAccessChecklist") {
          const customerName = formData.customerName;
          const submitterEmail = formData.submittedBy;
          const summary = generateSummary(formData, customerName, submitterEmail);

          await axios.post("https://webexapis.com/v1/messages", {
            roomId: STRATEGIC_CSS_ROOM_ID,
            markdown: summary
          }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

          await axios.post("https://webexapis.com/v1/messages", {
            roomId: data.roomId,
            markdown: "✅ Submission received and summary sent to Strategic CSS room."
          }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

          // ✅ Airtable insert
  
 await base("Handoff Form").create({
    fields: {
      "Customer Name": formData.customerName || "",
      "Submitted By": formData.submittedBy || "",
      "Action Plan Link": formData.actionPlanLink || "",
      "Close Date": formData.actionPlanCloseDate || "",
      "Adoption Blockers": formData.adoptionBlockers || "",
      "Expansion Interests": formData.expansionInterests || "",
      "Comments": formData.comments || ""
    }
  });
  console.log("✅ Airtable record successfully created.");
} catch (err) {
  console.error("❌ Airtable write failed:", err.response?.data || err.message || err);
}

        // fallback for unhandled formTypes
        return res.sendStatus(200);
      } catch (err) {
        console.error("❌ Webhook error:", err.stack || err.message);
        return res.sendStatus(500);
      }
    }
  } catch (err) {
    console.error("❌ General webhook error:", err.stack || err.message);
    return res.sendStatus(500);
  }
}); // ✅ closes app.post("/webhook")

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function generateSummary(data, customer, submitter) {
  const comments = data.comments?.trim();
  const actionPlanLink = data.actionPlanLink?.trim();
  const actionPlanCloseDate = data.actionPlanCloseDate?.trim();
  const blockers = (data.adoptionBlockers || "")
    .split(",")
    .filter(b => b)
    .map(b => `• ${b.trim()}`)
    .join("\n") || "None";

  const checklistMap = [
    { key: "con_1", label: "Secure Client/IPsec Connectivity" },
    { key: "con_2", label: "DNS Redirection Verified" },
    { key: "con_3", label: "Rule Configured and Active" },
    { key: "pla_1", label: "Admin Access Granted" },
    { key: "pla_2", label: "User Roles Reviewed" },
    { key: "pol_1", label: "Web Profiles Reviewed" },
    { key: "pol_2", label: "Decryption + Do Not Decrypt Reviewed" },
    { key: "suc_2", label: "Pilot Use Case Delivered" },
    { key: "suc_3", label: "Expansion Opportunities Identified" },
    { key: "ope_4", label: "Understands Post-Onboarding Support" }
  ];

  const total = checklistMap.length;
  const completed = checklistMap.filter(({ key }) => data[key] === "true").length;
  const score = Math.round((completed / total) * 100);
  const riskLevel = score >= 90 ? "🟢 Healthy" : score >= 70 ? "🟡 At Risk" : "🔴 Critical";

  const incompleteItems = checklistMap
    .filter(({ key }) => data[key] !== "true")
    .map(({ label }) => `❗ ${label}`)
    .join("\n") || "✅ All key items completed.";

  const expansion = (data.expansionInterests || "")
    .split(",")
    .map(e => e.trim())
    .filter(Boolean);

  const expansionText = expansion.length
    ? `📈 **Customer Interested in Exploring:**\n• ${expansion.join("\n• ")}`
    : "";

  return `
✅ **Secure Access Handoff Summary**

- **Customer Name:** ${capitalize(customer)}
- **Submitted By:** ${submitter}
- **Score:** ${score}/100
- **Risk Level:** ${riskLevel}

🚧 **Items Requiring Follow-Up:**
${incompleteItems}

🔎 **Adoption Blockers:**
${blockers}

${expansionText}
${actionPlanLink ? `📎 **Action Plan Link:** [Open Action Plan](${actionPlanLink})` : ""}
${actionPlanCloseDate ? `📅 **Action Plan Close Date:** ${actionPlanCloseDate}` : ""}

💬 **Additional Comments:**  
> ${comments || "None"}
`;
}

async function sendForm(roomId, type) {
  const form = formMap[type];
  if (!form) return;
  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: `📋 Please complete the **${type}** form:`,
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: form
    }]
  }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
}

async function startBot() {
  try {
    const res = await axios.get("https://webexapis.com/v1/people/me", {
      headers: { Authorization: WEBEX_BOT_TOKEN }
    });
    BOT_PERSON_ID = res.data.id;
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 SSE-CX-Hub listening on port ${PORT}`));
  } catch (err) {
    console.error("❌ Failed to get bot info:", err.stack || err.message);
    process.exit(1);
  }
}

startBot();
