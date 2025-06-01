const { getPlaycard } = require("./playcards");
const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
let BOT_PERSON_ID = "";

const STRATEGIC_CSS_ROOM_ID = process.env.STRATEGIC_CSS_ROOM_ID || "Y2lzY29zcGFyazovL3VzL1JPT00vYTYzYWFmNjAtMWJjMC0xMWYwLWEwYmMtM2I5ZmNhY2JjZDgy";

const formMap = {
  deployment: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")),
  picker: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8")),
  evpForm: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "evpForm.json"), "utf8")),
  tacForm: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "tacForm.json"), "utf8")),
  caseForm: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "caseForm.json"), "utf8")),
  featureForm: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "featureForm.json"), "utf8")),
  blockerForm: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "blockerForm.json"), "utf8")),
  handoffForm: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "secureAccessHandoffForm.json"), "utf8")),
};

app.get("/test", (req, res) => {
  res.send("SSE-CX-Hub bot is up and running");
});

app.post("/webhook", async (req, res) => {
  console.log("Incoming webhook hit from room:", req.body?.data?.roomId);
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

      const text = (messageRes.data.text || "").toLowerCase().trim();
      const mentioned = data?.mentionedPeople?.includes(BOT_PERSON_ID);
      const isDirect = roomType === "direct";

      if (!mentioned && !isDirect) return res.sendStatus(200);

      if (text === "/submit") {
        await sendForm(roomId, "picker");
        return res.sendStatus(200);
      }

      if (text === "/submit deployment") {
        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: "Opening the **Secure Access Deployment Form**...\n\nPlease wait a few seconds if the bot was idle."
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });
        await sendForm(roomId, "deployment");
        return res.sendStatus(200);
      }

      if (text === "/submit handoff") {
        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: "Opening the **Secure Access Handoff Form**...\n\nPlease wait a few seconds if the bot was idle."
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });
        await sendForm(roomId, "handoffForm");
        return res.sendStatus(200);
      }

      if (text === "/help") {
        const helpMessage = `
**SSE-CX-Hub Bot – Help Menu**

Here are the available commands:

- \`/submit\` – Open the Multi-Option Submission Form Picker  
- \`/submit deployment\` – Open the Secure Access Onboarding & Deployment form  
- \`/submit handoff\` – Open the Secure Access Handoff form  
- \`/reset\` – Clear current session or inputs (coming soon)

Having issues?
Please contact: naas_support@cisco.com
        `;
        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: helpMessage
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });
        return res.sendStatus(200);
      }
    }

    if (resource === "attachmentActions") {
      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });
      const formData = actionRes.data.inputs;

      if (formData.formType === "formPicker") {
        const type = formData.submissionType;
        if (formMap[type + "Form"]) {
          await sendForm(roomId, `${type}Form`);
        }
        return res.sendStatus(200);
      }

      if (formData.formType === "handoff") {
        const score = parseInt(formData.finalScore) || 0;
        const tier = score >= 90 ? "Good – No handoff needed"
                   : score >= 70 ? "Needs Assistance – Handoff recommended"
                   : "At-Risk – Handoff required";

        const summary = `Secure Access Handoff Submitted

Customer: ${formData.customerName || "N/A"}  
Org ID: ${formData.orgId || "N/A"}  
Pilot Tier: ${formData.pilotStatus || "N/A"}  
Score: ${formData.finalScore || "N/A"}  
Blockers: ${(formData.risks || []).join(", ") || "None"}  
Tier Assessment: ${tier}  
Submitted By: ${formData.submittedBy || "N/A"}`;

        await axios.post("https://webexapis.com/v1/messages", {
          roomId: STRATEGIC_CSS_ROOM_ID,
          markdown: summary
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });

        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: `Handoff for ${formData.customerName || "Customer"} submitted.`
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });

        return res.sendStatus(200);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

async function sendForm(roomId, type) {
  const form = formMap[type];
  if (!form) return;
  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: `Please complete the ${type.replace(/Form$/, '')} form:`,
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: form
    }]
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });
}

async function startBot() {
  try {
    const res = await axios.get("https://webexapis.com/v1/people/me", {
      headers: { Authorization: WEBEX_BOT_TOKEN }
    });
    BOT_PERSON_ID = res.data.id;
    const PORT = process.env.PORT || 10000;
    app.listen(PORT, () => console.log(`SSE-CX-Hub listening on port ${PORT}`));
  } catch (err) {
    console.error("Failed to get bot info:", err.response?.data || err.message);
    process.exit(1);
  }
}

startBot();
