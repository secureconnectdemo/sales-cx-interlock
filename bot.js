const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");
// const { addHandoffEntry } = require("./sheet");

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

  let formData = null; // Declare formData with an initial value of null to avoid ReferenceError

  console.log("formData:", formData); // This will now log `null` if formData hasn't been set yet

  const submitterEmail = formData?.submittedBy || "N/A";
  console.log("submitterEmail:", submitterEmail);

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

      // Handle deployment and handoff commands
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

if (resource === "messages") {
  console.log("Processing a message event...");
  // Handle message events
}

if (resource === "attachmentActions") {
  const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
    headers: { Authorization: WEBEX_BOT_TOKEN }
  });
  const formData = actionRes.data.inputs;

  console.log("Processing a form submission...");
  console.log("formData:", formData);

  // Handle form submissions
}

  // Process the form submission...
}

// Handle attachment actions (form submission)
if (formData.formType === "secureAccessChecklist") {
  if (!formData.customerName || !formData.submittedBy) {
    return res.status(400).send("Missing required fields: Customer Name or Submitted By.");
  }

  const customerName = formData.customerName;
  const submitterEmail = formData.submittedBy;

    // Normalize blockers to an array
    const blockersRaw = formData.adoptionBlockers || "";
    const blockers = typeof blockersRaw === "string"
        ? blockersRaw.split(",").map(b => b.trim())
        : Array.isArray(blockersRaw) ? blockersRaw : [];

    // Calculate the initial score from toggles
    const totalToggles = Object.entries(formData).filter(([k, v]) => k.includes("_") && v === "true").length;
    const maxToggleItems = 26; // Update based on the actual number of toggles
    let score = Math.round((totalToggles / maxToggleItems) * 100);

    // Adjust score based on blockers
    blockers.forEach(b => {
        if (b.startsWith("high")) score -= 15;
        else if (b.startsWith("med")) score -= 10;
        else score -= 5;
    });

    // Ensure score doesn't go below 0
    if (score < 0) score = 0;

    // Determine icon and status
    const scoreIcon = score >= 70 ? (score >= 90 ? "🟢" : "🟡") : "🔴";
    const statusText = score >= 90 ? "✅ Healthy"
                     : score >= 70 ? "🟡 Further Assistance May Be Required"
                     : "🚨 At Risk";

    // Format blockers for message
    const blockerText = blockers.length ? blockers.map(b => `- ${b}`).join("\n") : "None";

    // Track incomplete items
    const incompleteItems = [];
    Object.entries(formData).forEach(([key, value]) => {
        if (key.includes("_") && value === "false") {
            const itemName = key.split("_")[1];  // Extract the relevant part of the key for a human-friendly name
            incompleteItems.push(`- ${capitalize(itemName.replace(/([A-Z])/g, ' $1'))}`);
        }
    });

    // Format incomplete items
    const incompleteItemsText = incompleteItems.length ? incompleteItems.join("\n") : "None";

    // Create summary message
    const summary = `📋 **Secure Access Onboarding Checklist Summary**

👤 **Customer:** ${customerName}
📧 **Submitted by:** ${submitterEmail}
📊 **Score:** ${scoreIcon} ${score}/100  
🧱 **Adoption Blockers:**  
${blockerText}

📌 **Status:** ${statusText}

🚧 **Incomplete Items:**
${incompleteItemsText}`;

    // Send summary to Strategic CSS Room
    await axios.post("https://webexapis.com/v1/messages", {
        roomId: STRATEGIC_CSS_ROOM_ID,
        markdown: summary
    }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

    // Send the summary back to the submitter
    const personalMessage = `${summary}

📌 **Action:** Please make sure to copy this output into the Console Notes for the respective account.`;

    await axios.post("https://webexapis.com/v1/messages", {
        toPersonEmail: submitterEmail,
        markdown: personalMessage
    }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

    console.log("✅ Summary posted to Strategic CSS and sent to submitter.");

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
