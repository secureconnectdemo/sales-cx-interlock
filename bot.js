const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");
const { addHandoffEntry } = require("./sheet");

const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
let BOT_PERSON_ID = "";

const regionARRRoomMap = {
  "AMER_200K_PLUS": "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1",
  "DEFAULT": "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1"
};

const formMap = {
  deployment: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")),
  picker: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8"))
};

function normalizeARR(arrTier) {
  switch (arrTier) {
    case "$200K+": return "200K_PLUS";
    case "$50K - $200K": return "50K_200K";
    case "$0 - $50K": return "0_50K";
    default: return arrTier.replace(/\W+/g, "_").toUpperCase();
  }
}

app.get("/test", (req, res) => {
  res.send("✅ SSE-CX-Hub bot is up and running");
});

app.post("/webhook", async (req, res) => {
  console.log("🔔 Incoming Webhook Event:", JSON.stringify(req.body, null, 2));

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

      if (!mentioned && !isDirect) {
        console.log("🟡 Bot not mentioned in group space. Ignoring message.");
        return res.sendStatus(200);
      }

      console.log("📨 Final parsed command:", text);

if (text.endsWith("/submit deployment")) {
  await sendForm(roomId, "deployment");
} else if (text.endsWith("/submit form") || text.endsWith("/start")) {
  await sendForm(roomId, "picker");
} else if (text.endsWith("/reports")) {
  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: getReportsMarkdown()
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });
} else if (text.endsWith("/help")) {
  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown:
      "**🤖 SSE-CX-Hub Bot Commands**\n\n" +
      "- `/submit deployment` – Start Engineering Deployment Planning form\n" +
      "- `/submit form` or `/start` – Choose which form to submit\n" +
      "- `/reports` – Get links to EVP, Adoption, and Tableau dashboards\n" +
      "- `/help` – Show this help message"
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });
}


      return res.sendStatus(200);
    }

    if (resource === "attachmentActions") {
      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });

      const formData = actionRes.data.inputs;
      await handleFormSubmission(roomId, formData, messageId);
      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

async function sendForm(roomId, type) {
  const form = formMap[type];
  if (!form) return;

  try {
    const roomCheck = await axios.get(`https://webexapis.com/v1/rooms/${roomId}`, {
      headers: { Authorization: WEBEX_BOT_TOKEN }
    });
    console.log("✅ Bot has access to room:", roomCheck.data.title);
  } catch (err) {
    console.error("❌ Bot does not have access to the room:", err.response?.data || err.message);
  }

  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: `📋 Please complete the **${type}** form:`,
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: form
    }]
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });
}

async function handleFormSubmission(roomId, formData, messageId) {
  const normalizedARR = normalizeARR(formData.arrTier);
  const key = `${formData.region}_${normalizedARR}`;
  const targetRoom = regionARRRoomMap[key] || regionARRRoomMap["DEFAULT"];

  const summary = `**📦 Secure Access - Onboard & Deployment Notification**

👤 **Customer:** ${formData.customerName}  
🆔 **Org ID:** ${formData.orgId}  
📊 **Total Licenses:** ${formData.totalLicenses}  
🚀 **Already Deployed:** ${formData.alreadyDeployed || "N/A"}  
📅 **Planned Rollout:** ${formData.plannedRollout}  
📍 **Deployment Plan Info:**  
${formData.deploymentPlan}  
📎 **File Upload Info:** ${formData.fileUploadInfo || "To be sent via follow-up"}`;

  await addHandoffEntry(formData); // still logs to Google Sheet

  try {
    await axios.post("https://webexapis.com/v1/messages", {
      roomId: targetRoom,
      markdown: summary
    }, {
      headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
    });

    await axios.post("https://webexapis.com/v1/messages", {
      roomId,
      markdown: `✅ Submission received for *${formData.customerName}*.`
    }, {
      headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
    });

    await addReaction(messageId, "thumbsup");
  } catch (err) {
    console.error("❌ Failed to post summary:", err.response?.data || err.message);
  }
}

async function addReaction(messageId, emoji) {
  try {
    await axios.post("https://webexapis.com/v1/message/reactions", {
      messageId,
      emoji
    }, {
      headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
    });
    console.log(`👍 Added reaction: ${emoji}`);
  } catch (err) {
    console.error("❌ Failed to add reaction:", err.response?.data || err.message);
  }
}

async function startBot() {
  try {
    const res = await axios.get("https://webexapis.com/v1/people/me", {
      headers: { Authorization: WEBEX_BOT_TOKEN }
    });
    BOT_PERSON_ID = res.data.id;
    console.log("🤖 Bot Person ID:", BOT_PERSON_ID);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 SSE-CX-Hub listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to get bot info:", err.response?.data || err.message);
    process.exit(1);
  }
}
function getReportsMarkdown() {
  return `**📊 Secure Access Reports & Dashboards**

🔹 **EVP Tracker**  
[Customer EVP Secure Access (SharePoint)](https://cisco.sharepoint.com/:x:/r/sites/SecureAccessEVP/_layouts/15/Doc.aspx?sourcedoc=%7B9C407F58-85B2-4117-AE0A-E351493EDA81%7D&file=Customer%20EVP%20Secure%20Access.xlsx)

🔹 **Secure Access Paying Accounts – Tableau**  
[SecureAccessPayingAccts](https://tableau.cisco.com/#/site/CiscoUmbrella/views/secure_access_paying_accts/SecureAccessPayingAccts?:iid=1)

🔹 **Digital Experience Monitoring – ThousandEyes**  
[SecureAccess-DEM](https://tableau.cisco.com/#/site/CiscoUmbrella/views/Secure_access_digital_experience_management/SecureAccess-DEM?:iid=1)

🔹 **Adoption Executive Dashboard (Vidcast)**  
[Vidcast Recording](https://app.vidcast.io/share/945e0997-79f0-4a80-abb2-12ff06af22c3?playerMode=vidcast)

🔹 **Dashboard Launch Pad (Security Section)**  
[CS LaunchPad – Tableau](https://tableau.cisco.com/#/site/CXAccelerationMetrics/views/CSDashboardsLaunchPad/CSLaunchPad?:iid=1)`;
}

startBot();
