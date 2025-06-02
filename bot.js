""const { getPlaycard } = require("./playcards");
const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
let BOT_PERSON_ID = "";

const STRATEGIC_CSS_ROOM_ID = process.env.STRATEGIC_CSS_ROOM_ID || "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1";

const formMap = {
  handoffForm: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "secureAccessHandoffForm.json"), "utf8")),
};

app.post("/webhook", async (req, res) => {
  const { data, resource } = req.body;
  const roomId = data?.roomId;
  const messageId = data?.id;
  if (!roomId || !messageId) return res.sendStatus(400);

  try {
    if (resource === "attachmentActions") {
      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });
      const formData = actionRes.data.inputs;

      if (formData.formType === "handoff") {
        const readinessFields = Object.keys(formData).filter(k => k.startsWith("ready_") && formData[k] === "true");
        const readinessCount = readinessFields.length;

        const blockerField = formData.risks || [];
        const penalties = {
          "🔴": 20,
          "🟡": 10,
          "🟢": 5
        };
        let penaltyScore = 0;
        blockerField.forEach(item => {
          if (item.startsWith("🔴")) penaltyScore += 20;
          else if (item.startsWith("🟡")) penaltyScore += 10;
          else if (item.startsWith("🟢")) penaltyScore += 5;
        });

        const totalReadiness = 26; // Adjust based on your form
        const scorePercent = Math.max(0, Math.round((readinessCount / totalReadiness) * 100) - penaltyScore);

        let tier = "", emoji = "", alert = "";
        if (scorePercent >= 90) {
          tier = "🟢 Good";
          emoji = "🟢";
        } else if (scorePercent >= 70) {
          tier = "🟡 Needs Assistance";
          emoji = "🟡";
          alert = `⚠️ Reminder: A handoff call with Strategic CSS is recommended.`;
        } else {
          tier = "🔴 At-Risk";
          emoji = "🔴";
          alert = `🚨 Action Required: A handoff call with Strategic CSS is mandatory.`;
        }

        const summary = `📌 **Secure Access Handoff Summary**

**Customer:** ${formData.customerName || "N/A"}  
**Org ID:** ${formData.orgId || "N/A"}  
**Score:** ${emoji} ${scorePercent}% – ${tier}  
**Blockers:** ${(blockerField || []).join(", ") || "None"}  
**Submitted By:** ${formData.submittedBy || "N/A"}

${alert}`;

        if (scorePercent < 90) {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId: STRATEGIC_CSS_ROOM_ID,
            markdown: summary
          }, {
            headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
          });
        }

        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: `✅ Score: ${scorePercent}% – ${tier}\n\n${alert ? alert : 'No action required.'}`
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
    markdown: `Please complete the **${type.replace(/Form$/, '')}** form:`,
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
