// bot.js - Cleaned up version

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
  "AMER_200K_PLUS": "<engineering-room-id>",
  "DEFAULT": "<default-room-id>"
};

const formMap = {
  handoff: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "salesHandoffForm.json"), "utf8")),
  deployment: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")),
  picker: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8"))
};

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

      if (!mentioned && !isDirect) return res.sendStatus(200);

      console.log("📨 Final parsed command:", text);

      if (text.endsWith("/submit handoff")) {
        await sendForm(roomId, "handoff");
      } else if (text.endsWith("/submit deployment")) {
        await sendForm(roomId, "deployment");
      } else if (text.endsWith("/submit form") || text.endsWith("/start")) {
        await sendForm(roomId, "picker");
      } else if (text.endsWith("/help")) {
        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: `**🤖 SSE-CX-Hub Bot Commands**\n\n- \`/submit handoff\` – Start Sales to Post-Sales Handoff form\n- \`/submit deployment\` – Start Engineering Deployment Planning form\n- \`/submit form\` or \`/start\` – Choose which form to submit\n- \`/help\` – Show this help message`
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
    await axios.get(`https://webexapis.com/v1/rooms/${roomId}`, {
      headers: { Authorization: WEBEX_BOT_TOKEN }
    });
  } catch (err) {
    console.error("❌ Bot cannot access room:", err.response?.data || err.message);
  }

  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: `📋 Please complete the **${type}** form:`,
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: form }]
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });
}

async function handleFormSubmission(roomId, formData, messageId) {
  const key = `${formData.region}_${formData.arrTier}`;
  const targetRoom = regionARRRoomMap[key] || regionARRRoomMap["DEFAULT"];

  if (formData.formType === "deployment") {
    await addHandoffEntry(formData);
    const summary = `
**📦 Secure Access - Onboard & Deployment Notification**

👤 **Customer:** ${formData.customerName}
🆔 **Org ID:** ${formData.orgId}
📊 **Total Licenses:** ${formData.totalLicenses}
🚀 **Already Deployed:** ${formData.alreadyDeployed || "N/A"}
📅 **Planned Rollout:** ${formData.plannedRollout}
📍 **Deployment Plan Info:**\n${formData.deploymentPlan}
📎 **File Upload Info:** ${formData.fileUploadInfo || "To be sent via follow-up"}`;

    await postSummary(roomId, targetRoom, summary, formData.customerName, messageId);
    return;
  }

  if (formData.formType === "handoff") {
    await addHandoffEntry(formData);
    const summary = `
**🧾 Sales to Post-Sales Handoff Summary**

Region: ${formData.region}
ARR Tier: ${formData.arrTier}
Sales Rep: ${formData.salesRep || "undefined"}
Customer: ${formData.customerName || "undefined"}
Customer POC: ${formData.customerPOC || "undefined"}
Product: ${formData.product || "undefined"}
Use Cases: ${formData.useCases || "undefined"}
Urgency: ${formData.urgency || "undefined"}
Notes: ${formData.notes || "undefined"}
Seeded/NFR: ${formData.nfrStatus || "undefined"}
Follow Up: ${formData.followUpNeeded || "undefined"}`;

    await postSummary(roomId, targetRoom, summary, formData.customerName, messageId);
  }
}

async function postSummary(originRoom, targetRoom, summary, customerName, messageId) {
  try {
    await axios.post("https://webexapis.com/v1/messages", {
      roomId: targetRoom,
      markdown: summary
    }, {
      headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
    });

    await axios.post("https://webexapis.com/v1/messages", {
      roomId: originRoom,
      markdown: `✅ Submission received for *${customerName}*.`
    }, {
      headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
    });

    await addReaction(messageId, "thumbsup");
  } catch (err) {
    console.error("❌ Failed during message post:", err.response?.data || err.message);
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
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log("🚀 SSE-CX-Hub listening on port", PORT);
    });
  } catch (err) {
    console.error("❌ Failed to get bot info:", err.response?.data || err.message);
    process.exit(1);
  }
}

startBot();


