const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");
const { addHandoffEntry } = require("./sheet");

const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
let BOT_PERSON_ID = "";

const STRATEGIC_CSS_ROOM_ID = "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1";
;

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

      const text = (messageRes.data.text || "").toLowerCase().trim();
      const mentioned = data?.mentionedPeople?.includes(BOT_PERSON_ID);
      const isDirect = roomType === "direct";

      if (!mentioned && !isDirect) return res.sendStatus(200);

      if (text === "/submit deployment") {
        console.log("📨 Matched '/submit deployment' command");
        try {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: "📝 Opening the **Secure Access Deployment Form**...\n\n⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*"
          }, {
            headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
          });
          await sendForm(roomId, "deployment");
          console.log("✅ Deployment form sent successfully");
        } catch (err) {
          console.error("❌ Error sending deployment form:", err.message);
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: `❌ Failed to send deployment form: ${err.message}`
          }, {
            headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
          });
        }
        return res.sendStatus(200);
      }

      if (text === "/submit handoff") {
        console.log("📨 Matched '/submit handoff' command");
        try {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: "📋 Opening the **Secure Access Handoff Form**...\n\n⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*"
          }, {
            headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
          });
          await sendForm(roomId, "handoff");
          console.log("✅ Handoff form sent successfully");
        } catch (err) {
          console.error("❌ Error sending handoff form:", err.message);
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: `❌ Failed to send handoff form: ${err.message}`
          }, {
            headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
          });
        }
        return res.sendStatus(200);
      }

      if (text === "/help") {
        const helpMessage = `
🤖 **SSE-CX-Hub Bot – Help Menu**

Here are the available commands:

- \`/submit deployment\` – Open the Secure Access Onboarding & Deployment form  
- \`/submit handoff\` – Open the Secure Access Handoff Form  
- \`/reset\` – Clear current session or inputs (coming soon)

ℹ️ *For the form to appear, it might take a few seconds — especially after long periods of inactivity. Please wait patiently for the confirmation message before retrying.*

🛠️ Having issues?
If something's not working, please report the issue to josfonse@cisco.com and complete the following form to provide the necessary deployment details: [ Deployment Planning](https://forms.office.com/r/zGd6u5MEmt).
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

      if (formData.formType === "handoff") {
        const score = Number(formData.finalScore || 0);
        let scoreColor = "🟢";
        if (score < 70) scoreColor = "🟡";
        if (score < 50) scoreColor = "🔴";

        const tier = score >= 90 ? "✅ No handoff needed"
                   : score >= 70 ? "⚠️ Handoff recommended"
                   : "🚨 At-risk handoff required";

        const summary = `📦 **Secure Access Handoff Summary**

👤 **Customer:** ${formData.customerName || "N/A"}  
🆔 **Org ID:** ${formData.orgId || "N/A"}  
📐 **Pilot Tier:** ${formData.pilotStatus || "N/A"}  
📊 **Score:** ${scoreColor} ${score}/100  
🧱 **Blockers:** ${(formData.risks || []).join(", ") || "None"}  
📌 **Tier Assessment:** ${tier}  
🙋 **Submitted By:** ${formData.submittedBy || "N/A"}`;

        await axios.post("https://webexapis.com/v1/messages", {
          roomId: CAPACITY_PLANNING_ROOM_ID,
          markdown: summary
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });

        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: `✅ Handoff score submitted for *${formData.customerName}*.`
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });

        return res.sendStatus(200);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.response?.data || err.message);
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
    markdown: `📋 Please complete the **${type}** form:`,
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
    app.listen(PORT, () => console.log(`🚀 SSE-CX-Hub listening on port ${PORT}`));
  } catch (err) {
    console.error("❌ Failed to get bot info:", err.response?.data || err.message);
    process.exit(1);
  }
}

startBot();
