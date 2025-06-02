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
      const mentioned = (data?.mentionedPeople || []).some(id => id.toLowerCase() === BOT_PERSON_ID.toLowerCase());
      const isDirect = roomType === "direct";

      if (!mentioned && !isDirect) return res.sendStatus(200);

      // Handle known commands
      if (text === "/submit deployment") {
        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: "📝 Opening the **Secure Access Deployment Form**...\n\n⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*"
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });
        await sendForm(roomId, "deployment");
        return res.sendStatus(200);
      }

      if (text === "/submit handoff") {
        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: "📋 Opening the **Secure Access Handoff Form**...\n\n⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*"
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });
        await sendForm(roomId, "handoff");
        return res.sendStatus(200);
      }

      if (text === "/help") {
        const helpMessage = `
🤖 **SSE-CX-Hub Bot – Help Menu**

Here are the available commands:

- \`/submit deployment\` – Open the Secure Access Onboarding & Deployment form  
- \`/submit handoff\` – Open the Secure Access Handoff Form  
- \`/reset\` – Clear current session or inputs (coming soon)

ℹ️ *For the form to appear, it might take a few seconds — especially after long periods of inactivity.*

🛠️ Having issues?  
Report issues to josfonse@cisco.com or complete the [Deployment Planning](https://forms.office.com/r/zGd6u5MEmt) form.
`;
        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: helpMessage
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });
        return res.sendStatus(200);
      }

      // Fallback for unknown commands
      await axios.post("https://webexapis.com/v1/messages", {
        roomId,
        markdown: `⚠️ Unknown command. Type \`/help\` to see available options.`
      }, {
        headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
      });
      return res.sendStatus(200);
    }

    if (resource === "attachmentActions") {
      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });
      const formData = actionRes.data.inputs;

      console.log("Processing a form submission...");
      console.log("formData:", formData);

      if (formData?.formType === "secureAccessChecklist") {
        if (!formData.customerName || !formData.submittedBy) {
          return res.status(400).send("Missing required fields: Customer Name or Submitted By.");
        }

        const customerName = formData.customerName;
        const submitterEmail = formData.submittedBy;
        const summary = generateSummary(formData, customerName, submitterEmail);

        await axios.post("https://webexapis.com/v1/messages", {
          roomId: STRATEGIC_CSS_ROOM_ID,
          markdown: summary
        }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

        await axios.post("https://webexapis.com/v1/messages", {
          toPersonEmail: submitterEmail,
          markdown: summary
        }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

        console.log("✅ Summary posted to Strategic CSS and sent to submitter.");
        return res.sendStatus(200);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.stack || err.message);
    res.sendStatus(500);
  }
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function generateSummary(data, customer, submitter) {
  return `
✅ **Secure Access Deployment Summary**

- **Customer Name:** ${capitalize(customer)}
- **Submitted By:** ${submitter}

📋 **Submitted Data:**
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`
`;
}

async function sendForm(roomId, type) {
  const form = formMap[type];
  if (!form) {
    console.warn(`⚠️ Unknown form type: ${type}`);
    return;
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

async function startBot() {
  try {
    const res = await axios.get("https://webexapis.com/v1/people/me", {
      headers: { Authorization: WEBEX_BOT_TOKEN }
    });
    BOT_PERSON_ID = res.data.id;
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 SSE-CX-Hub listening on port ${PORT}`));
  } catch (err) {
    console.error("❌ Failed to get bot info:", err.stack || err.message);
    process.exit(1);
  }
}

startBot();
