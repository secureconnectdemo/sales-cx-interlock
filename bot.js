
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
const axios = require("axios");
const { isValidWebexId, sanitizeLog } = require("./utils/validate");



const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
let BOT_PERSON_ID = "";

const STRATEGIC_CSS_ROOM_ID =
  "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1";

const formMap = {
  deployment: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")),
  picker: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8")),
  handoff: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "secureAccessHandoffForm.json"), "utf8")),
};

app.get("/test", (req, res) => {
  res.send("✅ SSE-CX-Hub bot is up and running");
});

app.post("/webhook", async (req, res) => {
  const { data, resource } = req.body;
  const roomId = data?.roomId;
  const roomType = data?.roomType;
  const messageId = data?.id;

  if (!roomId || !messageId) return res.sendStatus(400);

  try {
if (resource === "messages") {
  const idPattern = /^[a-zA-Z0-9_-]+$/;  // Adjust pattern as needed
  if (!idPattern.test(messageId)) {
    console.warn("Invalid messageId detected:", messageId);
    return res.status(400).send("Invalid message ID.");
  }

  const messageRes = await axios.get(
    `https://webexapis.com/v1/messages/${messageId}`,
    { headers: { Authorization: WEBEX_BOT_TOKEN } }
  );

      if (messageRes.data.personId === BOT_PERSON_ID) return res.sendStatus(200);

      const rawText = messageRes.data.text || "";
      const lines = rawText.split("\n").map(l => l.trim().toLowerCase()).filter(Boolean);
      const mentioned = (data?.mentionedPeople || []).some(id => id.toLowerCase() === BOT_PERSON_ID.toLowerCase());
      const isDirect = roomType === "direct";

      if (!mentioned && !isDirect) return res.sendStatus(200);

      for (const line of lines) {
        if (line === "/submit handoff") {
          await axios.post("https://webexapis.com/v1/messages", { roomId, markdown: "📋 Opening the **Secure Access Handoff Form**..." }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
          await sendForm(roomId, "handoff");
          return res.sendStatus(200);
        }
      }

      await axios.post("https://webexapis.com/v1/messages", { roomId, markdown: "⚠️ Unknown command. Type `/help` for options." }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
      return res.sendStatus(200);
    }



if (resource === "attachmentActions") {
  if (!isValidWebexId(data.id)) {
    console.error("Invalid data.id provided:", sanitizeLog(data.id));
    return res.status(400).send("Invalid ID format.");
  }

  const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
    headers: { Authorization: WEBEX_BOT_TOKEN }
  });

  const formData = actionRes.data.inputs;

  if (formData?.formType === "secureAccessChecklist") {
    const customerName = formData.customerName || "";
    const submitterEmail = formData.submittedBy || "";
    const orgId = formData.orgId || "";
    const updatedContacts = formData.updatedContacts || "";
    const roomType = data?.roomType || ""; // ✅ FIX: ensures we can check for direct message

    const onboardingScore = calculateChecklistScore(formData);
    const overallScore = calculateOverallScore(formData);
    const summary = generateSummary(formData, customerName, submitterEmail, onboardingScore, overallScore);

    // ✅ Send summary to Strategic CSS room
    await axios.post("https://webexapis.com/v1/messages", {
      roomId: STRATEGIC_CSS_ROOM_ID,
      markdown: summary
    }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

    // ✅ Send confirmation to submitter
    await axios.post("https://webexapis.com/v1/messages", {
      roomId: data.roomId,
      markdown: "✅ Submission received and summary sent to Strategic CSS room."
    }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

    // ✅ Send note to copy/paste if direct message
await axios.post("https://webexapis.com/v1/messages", {
  roomId: data.roomId,
  markdown: `📋 **Please copy and paste the following summary into the Console case notes for this account:**\n\n${summary}`
}, { headers: { Authorization: WEBEX_BOT_TOKEN } });


    // ✅ Write to Airtable with added fields
    const parsedBlockers = (formData.adoptionBlockers || "").split(",").map(v => v.trim()).filter(Boolean);
    const parsedExpansion = (formData.expansionInterests || "").split(",").map(v => v.trim()).filter(Boolean);
    const parsedUseCases = (formData.primaryUseCases || "").split(",").map(v => v.trim()).filter(Boolean);

    await base("Handoff Form").create({
      "Customer Name": customerName,
      "Submitted By": submitterEmail,
      "Action Plan Link": formData.actionPlanLink || "",
      "Close Date": formData.actionPlanCloseDate || "",
      "Adoption Blockers": parsedBlockers,
      "Expansion Interests": parsedExpansion,
      "Primary Use Cases": parsedUseCases,
      "Strategic CSS": formData.strategicCss || "",
      "Comments": formData.comments || "",
      "Customer Pulse": formData.customerPulse || "",
      "Account Status": formData.accountStatus || "",
      "Open Tickets": formData.openTickets || "",
      "Onboarding Score": onboardingScore,
      "Overall Score": overallScore,
      "Customer Org ID": orgId,
      "Updated Customer Contacts": updatedContacts
    });
  }

  return res.sendStatus(200);
}


  } catch (err) {
    console.error("❌ Error handling webhook:", err.message);
    return res.sendStatus(500);
  }
});

function calculateChecklistScore(data) {
  const ids = ["pla_1", "pla_2", "con_1", "con_2", "con_3", "con_5", "con_6", "pol_1", "pol_2", "pol_3", "pol_4", "pol_5", "vis_2", "vis_3", "ope_3", "ope_4", "ope_5", "suc_1", "suc_2", "suc_3"];
  const completed = ids.filter(id => data[id] === "true").length;
  return Math.round((completed / ids.length) * 100);
}

function calculateOverallScore(data) {
  let score = calculateChecklistScore(data);
  const blockers = (data.adoptionBlockers || "").split(",");
const blockerRawValues = (data.adoptionBlockers || "").split(",").map(b => b.trim()).filter(Boolean);
  // Adjust the score
for (const b of blockerRawValues) {
  if (b.includes("high-")) score -= 25;
  else if (b.includes("med-")) score -= 10;
  else if (b.includes("low-")) score -= 5;
}
  return Math.max(score, 0);
}
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function generateSummary(data, customer, submitter, onboardingScore, overallScore) {
const score = overallScore;
  const riskLevel = score <= 25 ? "Critical" : score <= 50 ? "High" : score <= 75 ? "Medium" : "Low";
  const riskEmoji = riskLevel === "Critical" ? "🔴" : riskLevel === "High" ? "🟠" : riskLevel === "Medium" ? "🟡" : "🟢";

  const checklistItems = [

    { id: "pla_1", label: "Secure Access dashboard admin access granted" },
    { id: "pla_2", label: "User roles and permissions reviewed and adjusted" },
    { id: "con_1", label: "Root Cert deployed and Connectivity established" },
    { id: "con_2", label: "DNS redirection active and verified" },
    { id: "con_3", label: "At least one Rule configured and active" },
    { id: "con_5", label: "Experience Insights enabled and confirmed" },
    { id: "con_6", label: "SaaS tenant integrations configured and validated" },
    { id: "pol_1", label: "Web profiles reviewed" },
    { id: "pol_2", label: "Decryption enabled and Do Not Decrypt list explained" },
    { id: "pol_3", label: "DLP/ RBI/ IPS settings reviewed" },
    { id: "pol_4", label: "VPN profiles and posture settings transferred" },
    { id: "pol_5", label: "Customer has interacted with the AI Assistant" },
    { id: "vis_2", label: "Schedule reports configured for key stakeholders" },
    { id: "vis_3", label: "Block hit data explained and correlated to policy efficacy" },
    { id: "ope_3", label: "Owner shown how to engage Cisco Support/TAC" },
    { id: "ope_4", label: "Customer is aware of post-onboarding support" },
    { id: "ope_5", label: "Customer is subscribed to SA newsletter and Cisco Community" },
    { id: "suc_1", label: "Original business outcomes reviewed with IT owner" },
    { id: "suc_2", label: "Pilot use case confirmed as delivered" },
    { id: "suc_3", label: "Additional features identified (Optimize/Expand phase)" }
  ];

  const checklist = checklistItems.filter(item => data[item.id] === "false").map(item => `❗ ${item.label}`).join("\n") || "✅ All items completed.";
  const blockers = (data.adoptionBlockers || "").split(",").filter(Boolean).map(b => `• ${b.trim()}`).join("\n") || "None";
  
  const expansion = (data.expansionInterests || "").split(",").filter(Boolean).map(i => `• ${i.trim()}`).join("\n") || "None";
  const comments = data.comments?.trim() || "None";
  const actionPlanLink = data.actionPlanLink?.trim() || "N/A";
  const closeDate = data.actionPlanCloseDate || "N/A";
  const pulse = data.customerPulse || "N/A";
  const status = data.accountStatus || "N/A";
  const strategicCss = data.strategicCss || "N/A";
  const primaryUseCases = (data.primaryUseCases || "").split(",").map(u => `• ${u.trim()}`).join("\n") || "None";
  const openTickets = data.openTickets?.trim() || "None";
  const orgId = data.orgId || "N/A";
  const updatedContacts = data.updatedContacts || "None";
  const blockerLabels = {
  "high-budget": "🔴 No Budget / Not a Priority",
  "high-infra": "🔴 Infrastructure Not Ready",
  "high-ga": "🔴 Product Not GA or Missing Features",
  "med-training": "🟠 Training or Configuration Support Needed",
  "med-complex": "🟠 Customer Perceives Product as Complex",
  "med-partner": "🟠 Partner Unresponsive or Unenabled",
  "low-doc": "🟢 Documentation Not Found",
  "low-contact": "🟢 Invalid or Missing Contact Info",
  "low-plan": "🟢 Ownership or Success Plan Unclear"
};

const blockerRawValues = (data.adoptionBlockers || "").split(",").map(b => b.trim()).filter(Boolean);

const blockerDisplayText = blockerRawValues.map(b => `• ${blockerLabels[b] || b}`).join("\n") || "None";


  
return `
✅ **Secure Access Handoff Summary**
- **Customer Name:** ${capitalize(customer)}
- **Submitted By:** ${submitter}
- **Strategic CSS:** ${strategicCss}
- **Primary Use Cases:**\n${primaryUseCases}
- **Onboarding Score (Checklist):** ${onboardingScore}/100
- **Overall Score (Adjusted):** ${overallScore}/100
- **Risk Level:** ${riskEmoji} ${riskLevel}
- **Customer Pulse:** ${pulse}
- **Account Status:** ${status}
- **Open Tickets:** ${openTickets}
 **Customer Org ID:** ${orgId}  
**Updated Customer Contacts:** ${updatedContacts}
🔎 **Adoption Blockers:**${blockerDisplayText}



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
function sendForm(roomId, type) {
  const form = formMap[type];
  if (!form) return;
  return axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: `📋 Please complete the **${type}** form:`,
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: form }]
  }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
}

async function startBot() {
  try {
    const res = await axios.get("https://webexapis.com/v1/people/me", { headers: { Authorization: WEBEX_BOT_TOKEN } });
    BOT_PERSON_ID = res.data.id;
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, function () {
      console.log("🚀 SSE-CX-Hub bot is running on port", PORT);
    });
  } catch (err) {
    console.error("❌ Failed to start bot:", err.message);
    process.exit(1);
  }
}

startBot();
