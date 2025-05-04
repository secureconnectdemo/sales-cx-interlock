const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");
const { addHandoffEntry } = require("./sheet");

const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
const BOT_EMAIL = "sse-cx-hub@webex.bot"; // Replace with your bot's actual email

const regionARRRoomMap = {
  "AMER_200K_PLUS": "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1",
  "DEFAULT": "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1"
};

const formMap = {
  handoff: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "salesHandoffForm.json"), "utf8")),
  deployment: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")),
  picker: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8"))
};

app.get("/test", (req, res) => {
  res.send("✅ SSE-CX-Hub bot is up and running");
});

// 🟢 This logs all incoming webhook traffic from Webex
app.post("/webhook", async (req, res) => {
  console.log("🔔 Incoming Webhook Event:", JSON.stringify(req.body, null, 2));

  const { data, resource } = req.body;
  const roomId = data?.roomId;
  if (!roomId) return res.sendStatus(400);

  try {
    if (resource === "messages") {
      const messageRes = await axios.get(`https://webexapis.com/v1/messages/${data.id}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });

      let text = (messageRes.data.text || "").toLowerCase().trim();

      // 🔧 Handle group space mentions by removing bot mention
      const mentionRegex = new RegExp(`<@personEmail:${BOT_EMAIL}>`, "gi");
      text = text.replace(mentionRegex, "").trim();
      console.log("📨 Final parsed command:", text);

      if (text === "/submit handoff") {
        await sendForm(roomId, "handoff");
        return res.sendStatus(200);
      }
      if (text === "/submit deployment") {
        await sendForm(roomId, "deployment");
        return res.sendStatus(200);
      }
      if (text === "/submit form" || text === "/start") {
        await sendForm(roomId, "picker");
        return res.sendStatus(200);
      }
    }

    if (resource === "attachmentActions") {
      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });

      const formData = actionRes.data.inputs;

      if (formData.formType === "handoff" || formData.formType === "deployment") {
        await sendForm(roomId, formData.formType);
      } else {
        await handleFormSubmission(roomId, formData);
      }

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

async function handleFormSubmission(roomId, formData) {
  if (formData.formType === "deployment") {
    const summary = `
**Secure Access – Deployment Notification**

Customer: ${formData.customerName}  
Org ID: ${formData.orgId}  
Total Licenses: ${formData.totalLicenses}  
Already Deployed: ${formData.alreadyDeployed || "N/A"}  
Planned Rollout: ${formData.plannedRollout}  
Deployment Plan: ${formData.deploymentPlan}  
File Upload Info: ${formData.fileUploadInfo || "To be sent via follow-up"}
    `;

    const engineeringRoom = regionARRRoomMap["AMER_200K_PLUS"];
    await axios.post("https://webexapis.com/v1/messages", {
      roomId: engineeringRoom,
      markdown: summary
    }, {
      headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
    });

    await axios.post("https://webexapis.com/v1/messages", {
      roomId,
      markdown: `✅ Deployment form submitted for *${formData.customerName}*.`
    }, {
      headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
    });

    return;
  }

  await addHandoffEntry(formData);

  const summary = `
**🧾 Sales to Post-Sales Handoff Summary**

Region: ${formData.region}  
ARR Tier: ${formData.arrTier}  
Sales Rep: ${formData.salesRep}  
Customer: ${formData.customerName}  
Customer POC: ${formData.customerPOC}  
Product: ${formData.product}  
Use Cases: ${formData.useCases}  
Urgency: ${formData.urgency}  
Notes: ${formData.notes}  
Seeded/NFR: ${formData.nfrStatus}  
Follow Up: ${formData.followUpNeeded}
  `;

  const key = formData.arrTier === "PREMIUM" ? "PREMIUM" : `${formData.region}_${formData.arrTier}`;
  const targetRoom = regionARRRoomMap[key] || regionARRRoomMap["DEFAULT"];

  await axios.post("https://webexapis.com/v1/messages", {
    roomId: targetRoom,
    markdown: summary
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });

  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: `✅ Sales handoff submitted for *${formData.customerName}*.`
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 SSE-CX-Hub listening on port ${PORT}`);
});

