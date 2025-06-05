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
      const messageRes = await axios.get(`https://webexapis.com/v1/messages/${messageId}`, { headers: { Authorization: WEBEX_BOT_TOKEN } });
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
      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, { headers: { Authorization: WEBEX_BOT_TOKEN } });
      const formData = actionRes.data.inputs;

      if (formData?.formType === "secureAccessChecklist") {
        const customerName = formData.customerName;
        const submitterEmail = formData.submittedBy;

        const onboardingScore = calculateChecklistScore(formData);
        const overallScore = calculateOverallScore(formData);
        const summary = generateSummary(formData, customerName, submitterEmail, onboardingScore, overallScore);

        await axios.post("https://webexapis.com/v1/messages", { roomId: STRATEGIC_CSS_ROOM_ID, markdown: summary }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
        await axios.post("https://webexapis.com/v1/messages", { roomId: data.roomId, markdown: "✅ Submission received and summary sent to Strategic CSS room." }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

        await base("Handoff Form").create({
          fields: {
            "Customer Name": customerName || "",
            "Submitted By": submitterEmail || "",
            "Action Plan Link": formData.actionPlanLink || "",
            "Close Date": formData.actionPlanCloseDate || "",
            "Adoption Blockers": formData.adoptionBlockers || "",
            "Expansion Interests": formData.expansionInterests || "",
            "Comments": formData.comments || "",
            "Customer Pulse": formData.customerPulse || "",
            "Account Status": formData.accountStatus || "",
            "Use Case": formData.useCase || "",
            "Open Tickets": formData.openTickets || ""
          }
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
  for (const b of blockers) {
    if (b.includes("high-")) score -= 25;
    else if (b.includes("med-")) score -= 10;
    else if (b.includes("low-")) score -= 5;
  }
  return Math.max(score, 0);
}

function generateSummary(data, customer, submitter, onboardingScore, overallScore) {
  const riskLevel = overallScore <= 25 ? "At Risk" : overallScore <= 75 ? "Needs Attention" : "All Good";
  const riskEmoji = riskLevel === "At Risk" ? "🔴" : riskLevel === "Needs Attention" ? "🟡" : "🟢";
  const useCase = data.useCase || "Not specified";
  const tickets = data.openTickets || "None";

  return `
✅ **Secure Access Handoff Summary**

- **Customer Name:** ${customer}
- **Submitted By:** ${submitter}
- **Onboarding Score:** ${onboardingScore}/100
- **Overall Score:** ${overallScore}/100
- **Risk Level:** ${riskEmoji} ${riskLevel}
- **Use Case:** ${useCase}
- **Open Tickets:** ${tickets}

📌 Please review this overview as part of the onboarding success status.`;
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
