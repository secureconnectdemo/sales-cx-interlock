//working  

const Airtable = require("airtable");

Airtable.configure({
  endpointUrl: "https://api.airtable.com",
  apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN
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

// Load form JSON files
const formMap = {
  deployment: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")),
  picker: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8")),
  handoff: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "secureAccessHandoffForm.json"), "utf8")),
};

// Health check route
app.get("/test", (req, res) => {
  res.send("✅ SSE-CX-Hub bot is up and running");
});

// Webhook route
app.post("/webhook", async (req, res) => {
  console.log("🔥 Incoming webhook hit");
  const { data, resource } = req.body;
  const roomId = data?.roomId;
  const roomType = data?.roomType;
  const messageId = data?.id;

  if (!roomId || !messageId) {
    return res.sendStatus(400);
  }

  try {
    if (resource === "messages") {
      const messageRes = await axios.get(`https://webexapis.com/v1/messages/${messageId}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN },
      });

      if (messageRes.data.personId === BOT_PERSON_ID) {
        console.log("🛑 Ignoring bot's own message");
        return res.sendStatus(200);
      }

      const rawText = messageRes.data.text || "";
      const lines = rawText
        .split("\n")
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0);

      const mentioned = (data?.mentionedPeople || []).some((id) => id.toLowerCase() === BOT_PERSON_ID.toLowerCase());
      const isDirect = roomType === "direct";

      if (!mentioned && !isDirect) {
        return res.sendStatus(200);
      }

      let commandRecognized = false;

      for (const line of lines) {
        if (commandRecognized) break;

        if (line === "/submit deployment") {
          await axios.post(
            "https://webexapis.com/v1/messages",
            {
              roomId,
              markdown: "📝 Opening the **Secure Access Deployment Form**...\n\n⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*",
            },
            { headers: { Authorization: WEBEX_BOT_TOKEN } }
          );
          await sendForm(roomId, "deployment");
          commandRecognized = true;
        } else if (line === "/submit handoff") {
          await axios.post(
            "https://webexapis.com/v1/messages",
            {
              roomId,
              markdown: "📋 Opening the **Secure Access Handoff Form**...\n\n⌛ *Please wait a few seconds for the form to appear if the bot has been idle.*",
            },
            { headers: { Authorization: WEBEX_BOT_TOKEN } }
          );
          await sendForm(roomId, "handoff");
          commandRecognized = true;
        } else if (line === "/help") {
          await axios.post(
            "https://webexapis.com/v1/messages",
            {
              roomId,
              markdown: `
🤖 **SSE-CX-Hub Bot – Help Menu**
\`/submit deployment\` – Open Deployment Form  
\`/submit handoff\` – Open Handoff Checklist  
\`/reset\` – (Coming Soon)  
Contact: josfonse@cisco.com`,
            },
            { headers: { Authorization: WEBEX_BOT_TOKEN } }
          );
          commandRecognized = true;
        } else if (line === "/reset") {
          await axios.post(
            "https://webexapis.com/v1/messages",
            {
              roomId,
              markdown: "🔄 Reset acknowledged. (Coming soon.)",
            },
            { headers: { Authorization: WEBEX_BOT_TOKEN } }
          );
          commandRecognized = true;
        }
      }

      if (!commandRecognized) {
        await axios.post(
          "https://webexapis.com/v1/messages",
          {
            roomId,
            markdown: "⚠️ Unknown command. Type \`/help\` for options.",
          },
          { headers: { Authorization: WEBEX_BOT_TOKEN } }
        );
      }

      return res.sendStatus(200);
    }

    if (resource === "attachmentActions") {
      console.log("📩 Attachment Action Triggered");

      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN },
      });

      const formData = actionRes.data.inputs;
      console.log("📝 Processing form submission:", formData);

      if (formData?.formType === "secureAccessChecklist") {
        const customerName = formData.customerName;
        const submitterEmail = formData.submittedBy;
        const summary = generateSummary(formData, customerName, submitterEmail);

        await axios.post(
          "https://webexapis.com/v1/messages",
          {
            roomId: STRATEGIC_CSS_ROOM_ID,
            markdown: summary,
          },
          { headers: { Authorization: WEBEX_BOT_TOKEN } }
        );

        await axios.post(
          "https://webexapis.com/v1/messages",
          {
            roomId: data.roomId,
            markdown: "✅ Submission received and summary sent to Strategic CSS room.",
          },
          { headers: { Authorization: WEBEX_BOT_TOKEN } }
        );

await base("Handoff Form").create({
  "Customer Name": formData.customerName || "",
  "Submitted By": formData.submittedBy || "",
  "Action Plan Link": formData.actionPlanLink || "",
  "Close Date": formData.actionPlanCloseDate || "",
  "Adoption Blockers": formData.adoptionBlockers || "",
  "Expansion Interests": formData.expansionInterests || "",
  "Comments": formData.comments || ""
});

console.log("✅ Airtable record successfully created.");

const confirmation = `✅ Handoff received and recorded. We'll take it from here!

📋 **Please copy and paste the following summary into the Console case notes** for this account:

${summary}`;

await axios.post(
  "https://webexapis.com/v1/messages",
  {
    roomId: data.roomId,
    markdown: confirmation,
  },
  { headers: { Authorization: WEBEX_BOT_TOKEN } }
);

// ✅ Close the checklist `if` block
}  

// ✅ Respond to webhook call
return res.sendStatus(200);

// Helper functions
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function generateSummary(data, customer, submitter) {
  const comments = data.comments?.trim();
  const actionPlanLink = data.actionPlanLink?.trim();
  const blockers = (data.adoptionBlockers || "")
    .split(",")
    .map((b) => `• ${b.trim()}`)
    .join("\n") || "None";

  return `
✅ **Secure Access Handoff Summary**
- **Customer Name:** ${capitalize(customer)}
- **Submitted By:** ${submitter}
- **Adoption Blockers:**  
${blockers}
💬 **Comments:**  
> ${comments || "None"}
`;
}

async function sendForm(roomId, type) {
  const form = formMap[type];
  if (!form) return;
  await axios.post(
    "https://webexapis.com/v1/messages",
    {
      roomId,
      markdown: `📋 Please complete the **${type}** form:`,
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: form,
        },
      ],
    },
    { headers: { Authorization: WEBEX_BOT_TOKEN } }
  );
}

// Start the bot
async function startBot() {
  try {
    const res = await axios.get("https://webexapis.com/v1/people/me", {
      headers: { Authorization: WEBEX_BOT_TOKEN },
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
