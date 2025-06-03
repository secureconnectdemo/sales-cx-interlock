const Airtable = require("airtable");

Airtable.configure({
  endpointUrl: "https://api.airtable.com",
  apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN,
});

const base = Airtable.base("appG1ZNhb2KRKQQOI");
const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
let BOT_PERSON_ID = "";

const STRATEGIC_CSS_ROOM_ID =
  "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1";

const formMap = {
  deployment: JSON.parse(
    fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")
  ),
  picker: JSON.parse(
    fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8")
  ),
  handoff: JSON.parse(
    fs.readFileSync(path.join(__dirname, "forms", "secureAccessHandoffForm.json"), "utf8")
  ),
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
      const messageRes = await axios.get(`https://webexapis.com/v1/messages/${messageId}`,
        { headers: { Authorization: WEBEX_BOT_TOKEN } });

      if (messageRes.data.personId === BOT_PERSON_ID) return res.sendStatus(200);

      const rawText = messageRes.data.text || "";
      const lines = rawText.split("\n").map(l => l.trim().toLowerCase()).filter(Boolean);

      const mentioned = (data?.mentionedPeople || []).some(id => id.toLowerCase() === BOT_PERSON_ID.toLowerCase());
      const isDirect = roomType === "direct";
      if (!mentioned && !isDirect) return res.sendStatus(200);

      for (const line of lines) {
        if (line === "/submit deployment") {
          await axios.post("https://webexapis.com/v1/messages",
            { roomId, markdown: "📝 Opening the **Secure Access Deployment Form**...\n\n⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*" },
            { headers: { Authorization: WEBEX_BOT_TOKEN } });
          await sendForm(roomId, "deployment"); return res.sendStatus(200);
        } else if (line === "/submit handoff") {
          await axios.post("https://webexapis.com/v1/messages",
            { roomId, markdown: "📋 Opening the **Secure Access Handoff Form**...\n\n⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*" },
            { headers: { Authorization: WEBEX_BOT_TOKEN } });
          await sendForm(roomId, "handoff"); return res.sendStatus(200);
        } else if (line === "/help") {
          await axios.post("https://webexapis.com/v1/messages",
            { roomId, markdown: `🤖 **SSE-CX-Hub Bot – Help Menu**\n\`/submit deployment\` – Open Deployment Form  \n\`/submit handoff\` – Open Handoff Checklist  \n\`/reset\` – (Coming Soon)  \nContact: josfonse@cisco.com` },
            { headers: { Authorization: WEBEX_BOT_TOKEN } }); return res.sendStatus(200);
        } else if (line === "/reset") {
          await axios.post("https://webexapis.com/v1/messages",
            { roomId, markdown: "🔄 Reset acknowledged. (Coming soon.)" },
            { headers: { Authorization: WEBEX_BOT_TOKEN } }); return res.sendStatus(200);
        }
      }

      await axios.post("https://webexapis.com/v1/messages",
        { roomId, markdown: "⚠️ Unknown command. Type \`/help\` for options." },
        { headers: { Authorization: WEBEX_BOT_TOKEN } });

      return res.sendStatus(200);
    }

    if (resource === "attachmentActions") {
      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`,
        { headers: { Authorization: WEBEX_BOT_TOKEN } });
      const formData = actionRes.data.inputs;

      if (formData?.formType === "secureAccessChecklist") {
        const customerName = formData.customerName;
        const submitterEmail = formData.submittedBy;
        const summary = generateSummary(formData, customerName, submitterEmail);

        await axios.post("https://webexapis.com/v1/messages",
          { roomId: STRATEGIC_CSS_ROOM_ID, markdown: summary },
          { headers: { Authorization: WEBEX_BOT_TOKEN } });

        await axios.post("https://webexapis.com/v1/messages",
          { roomId: data.roomId, markdown: "✅ Submission received and summary sent to Strategic CSS room." },
          { headers: { Authorization: WEBEX_BOT_TOKEN } });

        await base("Handoff Form").create({
          "Customer Name": formData.customerName || "",
          "Submitted By": formData.submittedBy || "",
          "Action Plan Link": formData.actionPlanLink || "",
          "Close Date": formData.actionPlanCloseDate || "",
          "Adoption Blockers": formData.adoptionBlockers || "",
          "Expansion Interests": formData.expansionInterests || "",
          "Comments": formData.comments || "",
          "Customer Pulse": formData.customerPulse || "",
          "Account Status": formData.accountStatus || ""
        });

        const confirmation = `✅ Handoff received and recorded. We'll take it from here!\n\n📋 **Please copy and paste the following summary into the Console case notes** for this account:\n\n${summary}`;

        await axios.post("https://webexapis.com/v1/messages",
          { roomId: data.roomId, markdown: confirmation },
          { headers: { Authorization: WEBEX_BOT_TOKEN } });
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ General webhook error:", err.stack || err.message);
    return res.sendStatus(500);
  }
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function calculateScore(data) {
  const checklist_ids = [
    "pla_1","pla_2","con_1","con_2","con_3","con_5","con_6",
    "pol_1","pol_2","pol_3","pol_4","pol_5","vis_2","vis_3",
    "ope_3","ope_4","ope_5","suc_1","suc_2","suc_3"
  ];
  const total = checklist_ids.length;
  const done = checklist_ids.filter(id => data[id] === "true").length;
  let score = Math.round((done / total) * 100);

  const blockers = (data.adoptionBlockers || "").split(",");
  blockers.forEach(b => {
    if (b.includes("high-")) score -= 25;
    else if (b.includes("med-")) score -= 10;
    else if (b.includes("low-")) score -= 5;
  });
  return Math.max(score, 0);
}

function generateSummary(data, customer, submitter) {
  const score = calculateScore(data);
  const riskLevel = score <= 25 ? "Critical" : score <= 50 ? "High" : score <= 75 ? "Medium" : "Low";
  const riskEmoji = riskLevel === "Critical" ? "🔴" : riskLevel === "High" ? "🟠" : riskLevel === "Medium" ? "🟡" : "🟢";

  const checklist = [
    { id: "dns", label: "DNS Redirection Verified" },
    { id: "rule", label: "Rule Configured and Active" },
    { id: "admin", label: "Admin Access Granted" },
    { id: "roles", label: "User Roles Reviewed" },
    { id: "web", label: "Web Profiles Reviewed" },
    { id: "pilot", label: "Pilot Use Case Delivered" },
    { id: "expansion", label: "Expansion Opportunities Identified" },
    { id: "support", label: "Understands Post-Onboarding Support" },
  ].filter(i => data[i.id] === "false").map(i => `❗ ${i.label}`).join("\n") || "✅ All items completed.";

  const blockers = (data.adoptionBlockers || "").split(",").filter(Boolean).map(b => `• ${b.trim()}`).join("\n") || "None";
  const expansion = (data.expansionInterests || "").split(",").filter(Boolean).map(i => `• ${i.trim()}`).join("\n") || "None";
  const comments = data.comments?.trim() || "None";
  const actionPlanLink = data.actionPlanLink?.trim() || "N/A";
  const closeDate = data.actionPlanCloseDate || "N/A";
  const pulse = data.customerPulse || "N/A";
  const status = data.accountStatus || "N/A";

  return `
✅ **Secure Access Handoff Summary**
- **Customer Name:** ${capitalize(customer)}
- **Submitted By:** ${submitter}
- **Score:** ${score}/100
- **Risk Level:** ${riskEmoji} ${riskLevel}
- **Customer Pulse:** ${pulse}
- **Account Status:** ${status}

🛠️ **Items Requiring Follow-Up:**
${checklist}

🔎 **Adoption Blockers:**
${blockers}

📈 **Customer Interested in Exploring:**
${expansion}

🔗 **Action Plan Link:** [Open Action Plan](${actionPlanLink})
📅 **Action Plan Close Date:** ${closeDate}

🗒️ **Additional Comments:**
> ${comments}`;
}

async function sendForm(roomId, type) {
  const form = formMap[type];
  if (!form) return;
  await axios.post("https://webexapis.com/v1/messages",
    {
      roomId,
      markdown: `📋 Please complete the **${type}** form:\`,
      attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: form }],
    },
    { headers: { Authorization: WEBEX_BOT_TOKEN } });
}

async function startBot() {
  try {
    const res = await axios.get("https://webexapis.com/v1/people/me",
      { headers: { Authorization: WEBEX_BOT_TOKEN } });
    BOT_PERSON_ID = res.data.id;
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, function () {
  console.log('🚀 SSE-CX-Hub listening on port ' + PORT);
});
  } catch (err) {
    console.error("❌ Failed to get bot info:", err.stack || err.message);
    process.exit(1);
  }
}

startBot();
