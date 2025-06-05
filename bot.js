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

const STRATEGIC_CSS_ROOM_ID = "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1";

const formMap = {
  deployment: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")),
  picker: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8")),
  handoff: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "secureAccessHandoffForm.json"), "utf8")),
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
        headers: { Authorization: WEBEX_BOT_TOKEN },
      });
      if (messageRes.data.personId === BOT_PERSON_ID) return res.sendStatus(200);

      const rawText = messageRes.data.text || "";
      const lines = rawText.split("\n").map(l => l.trim().toLowerCase()).filter(Boolean);

      const mentioned = (data?.mentionedPeople || []).some(id => id.toLowerCase() === BOT_PERSON_ID.toLowerCase());
      const isDirect = roomType === "direct";
      if (!mentioned && !isDirect) return res.sendStatus(200);

      for (const line of lines) {
        if (line === "/submit deployment") {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: `📝 Opening the **Secure Access Deployment Form**...

⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*",
          }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
          await sendForm(roomId, "deployment");
          return res.sendStatus(200);
        } else if (line === "/submit handoff") {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: `📋 Opening the **Secure Access Handoff Form**...

⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*",
          }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
          await sendForm(roomId, "handoff");
          return res.sendStatus(200);
        } else if (line === "/help") {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: `🤖 **SSE-CX-Hub Bot – Help Menu**
`/submit deployment` – Open Deployment Form
`/submit handoff` – Open Handoff Checklist
`/reset` – (Coming Soon)
Contact: josfonse@cisco.com",
          }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
          return res.sendStatus(200);
        } else if (line === "/reset") {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: `🔄 Reset acknowledged. (Coming soon.)",
          }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
          return res.sendStatus(200);
        }
      }

      await axios.post("https://webexapis.com/v1/messages", {
        roomId,
        markdown: `⚠️ Unknown command. Type `/help` for options.",
      }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

      return res.sendStatus(200);
    }

    if (resource === "attachmentActions") {
      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN },
      });
      const formData = actionRes.data.inputs;

      if (formData?.formType === "secureAccessChecklist") {
        const customerName = formData.customerName;
        const submitterEmail = formData.submittedBy;
        const summary = generateSummary(formData, customerName, submitterEmail);

        await axios.post("https://webexapis.com/v1/messages", {
          roomId: STRATEGIC_CSS_ROOM_ID,
          markdown: summary,
        }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

        await axios.post("https://webexapis.com/v1/messages", {
          roomId: data.roomId,
          markdown: `✅ Submission received and summary sent to Strategic CSS room.",
        }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

        const blockers = (formData.adoptionBlockers || "").split(",").map(b => b.trim()).filter(b =>
          ["high-budget", "high-infra", "high-ga", "med-training", "med-complex", "med-partner", "low-doc", "low-contact", "low-plan"].includes(b));
        const allowedStatuses = ["New Request", "On Track", "Off Trajectory", "On Hold", "Completed - Successful", "Completed - Unsuccessful"];
        const status = allowedStatuses.includes(formData.accountStatus) ? formData.accountStatus : "";

        await base("Handoff Form").create({
          "Customer Name": customerName || "",
          "Submitted By": submitterEmail || "",
          "Action Plan Link": formData.actionPlanLink || "",
          "Close Date": formData.actionPlanCloseDate || "",
          "Adoption Blockers": blockers,
          "Expansion Interests": (formData.expansionInterests || "").split(",").map(i => i.trim()).filter(Boolean),
          "Comments": formData.comments || "",
          "Customer Pulse": formData.customerPulse || "",
          "Account Status": status || "",
          "Use Cases": formData.useCases || "",
          "Open Tickets": formData.openTickets || "",
        });
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ General webhook error:", err.response?.data || err.stack || err.message);
    return res.sendStatus(500);
  }
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function calculateScore(data) {
  const checklist_ids = ["pla_1", "pla_2", "con_1", "con_2", "con_3", "con_5", "con_6", "pol_1", "pol_2", "pol_3", "pol_4", "pol_5", "vis_2", "vis_3", "ope_3", "ope_4", "ope_5", "suc_1", "suc_2", "suc_3"];
  const total = checklist_ids.length;
  const done = checklist_ids.filter(id => data[id] === "true").length;

  const onboardingScore = Math.round((done / total) * 100);
  let penalties = 0;
  const blockers = (data.adoptionBlockers || "").split(",");
  blockers.forEach(b => {
    if (b.includes("high-")) penalties += 25;
    else if (b.includes("med-")) penalties += 10;
    else if (b.includes("low-")) penalties += 5;
  });

  const overallScore = Math.max(onboardingScore - penalties, 0);
  return { onboardingScore, overallScore };
}

function generateSummary(data, customer, submitter) {
  const { onboardingScore, overallScore } = calculateScore(data);

  let riskLabel = "All Good", riskEmoji = "🟢";
  if (overallScore <= 25) { riskLabel = "At Risk"; riskEmoji = "🔴"; }
  else if (overallScore <= 50) { riskLabel = "Needs Attention"; riskEmoji = "🟠"; }
  else if (overallScore <= 75) { riskLabel = "Monitor"; riskEmoji = "🟡"; }

  const checklistItems = [
    { id: "pol_2", label: "Decryption enabled and Do Not Decrypt list explained" },
    { id: "pol_3", label: "DLP/ RBI/ IPS settings reviewed" },
    { id: "pol_4", label: "VPN profiles and posture settings transferred" },
    { id: "pol_5", label: "Customer has interacted with the AI Assistant" },
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
  const useCases = (data.useCases || "").split(",").map(u => `• ${u.trim()}`).join("\n") || "Not specified";
  const tickets = data.openTickets || "None listed";

  return `
✅ **Secure Access Handoff Summary**
- **Customer Name:** ${capitalize(customer)}
- **Submitted By:** ${submitter}
- **Onboarding Score:** ${onboardingScore}/100
- **Overall Score:** ${overallScore}/100
- **Risk Level:** ${riskEmoji} ${riskLabel}
- **Customer Pulse:** ${pulse}
- **Account Status:** ${status}

🔁 **Use Cases Selected:**
${useCases}

📂 **Open Support Tickets:**
${tickets}

🛠️ **Items Requiring Follow-Up:**
${checklist}

🔎 **Adoption Blockers:**
${blockers}

📈 **Customer Interested in Exploring:**
${expansion}

🔗 **Action Plan Link:** [Open Action Plan](${actionPlanLink})
📅 **Action Plan Close Date:** ${closeDate}

🗒️ **Additional Comments:**
> ${comments}

📊 _This handoff summary contributes to the ongoing overview of all accounts submitted to Strategic CSS._`;
}

async function sendForm(roomId, type) {
  const form = formMap[type];
  if (!form) return;
  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: `📋 Please complete the **${type}** form:`,
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: form }],
  }, { headers: { Authorization: WEBEX_BOT_TOKEN } });
}

async function startBot() {
  try {
    const res = await axios.get("https://webexapis.com/v1/people/me", {
      headers: { Authorization: WEBEX_BOT_TOKEN },
    });
    BOT_PERSON_ID = res.data.id;
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log("🚀 SSE-CX-Hub listening on port " + PORT));
  } catch (err) {
    console.error("❌ Failed to get bot info:", err.stack || err.message);
    process.exit(1);
  }
}

startBot();
