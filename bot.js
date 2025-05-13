const { getPlaycard } = require("./playcards");
const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");
const { addHandoffEntry } = require("./sheet");
// const { getAccountsWithBarrier } = require("./airtable"); // Airtable disabled for now

const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
let BOT_PERSON_ID = "";

const CAPACITY_PLANNING_ROOM_ID = "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1";

const formMap = {
  deployment: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")),
  picker: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8"))
};

app.get("/test", (req, res) => {
  res.send("✅ SSE-CX-Hub bot is up and running");
});

app.post("/webhook", async (req, res) => {
  console.log("🔥 Incoming webhook hit");
  console.log("BODY:", JSON.stringify(req.body, null, 2));
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

      if (text === "/help") {
        const helpMessage = `
🤖 **SSE-CX-Hub Bot – Help Menu**

Here are the available commands:

- \`/submit deployment\` – Open the Secure Access Onboarding & Deployment form  
- \`/playcard [segment] [task-name]\` – Retrieve a task playcard (e.g., \`/playcard digital onboarding\`) (coming soon)
- \`/status\` – Check your last deployment form submission (coming soon)  
- \`/reset\` – Clear current session or inputs (coming soon)

ℹ️ *Note: Submitting the form may take a few seconds, especially after long periods of inactivity. Please wait for the confirmation message.*

🛠️ If something's not working, please use this form to provide the information on the acount in question [this form](https://forms.office.com/r/zGd6u5MEmt) and report the issue to josfonse@cisco.com.
        `;

        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: helpMessage
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });

        return res.sendStatus(200);
      }

      if (text.startsWith("/playcard")) {
        const [, segmentRaw, ...taskParts] = text.split(" ");
        const segment = capitalize(segmentRaw);
        const task = taskParts.join(" ").replace(/-/g, " ");
        const card = getPlaycard(segment, task);

        const response = card
          ? `**${segment} - ${task}**\n\n**Owner:** ${card.owner}\n**Title:** ${card.title}\n\n${(card.description || []).map(d => "- " + d).join("\n")}`
          : `❌ No playcard found for segment **${segment}** and task **${task}**.`;

        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: response
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

      if (formData.formType === "deployment") {
        const summary = `**📦 Secure Access - Onboard & Deployment Notification**\n\n👤 **Customer:** ${formData.customerName}  \n🆔 **Org ID:** ${formData.orgId}  \n📊 **Total Licenses:** ${formData.totalLicenses}  \n🚀 **Already Deployed:** ${formData.alreadyDeployed || "N/A"}  \n📅 **Planned Rollout:** ${formData.plannedRollout}  \n📍 **Deployment Plan Info:**  \n${formData.deploymentPlan}  \n📎 **File Upload Info:** ${formData.fileUploadInfo || "To be sent"}`;

        await addHandoffEntry(formData);

        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: summary
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });

        await axios.post("https://webexapis.com/v1/messages", {
          roomId: CAPACITY_PLANNING_ROOM_ID,
          markdown: `📢 **New Form Submission Notification**

👤 **Customer:** ${formData.customerName}  
🆔 **Org ID:** ${formData.orgId}  
📊 **Total Licenses:** ${formData.totalLicenses}  
🚀 **Already Deployed:** ${formData.alreadyDeployed || "N/A"}  
📅 **Planned Rollout:** ${formData.plannedRollout}  
📍 **Deployment Plan Info:**  
${formData.deploymentPlan}  
📎 **File Upload Info:** ${formData.fileUploadInfo || "To be sent"}  
👤 **Submitted By:** ${formData.submittedBy || "N/A"}`
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });

        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: `✅ Submission received for *${formData.customerName}*.`
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
    markdown: `📋 Please complete the **${type}** form:\`,
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
