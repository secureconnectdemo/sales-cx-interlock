const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
const STRATEGIC_CSS_ROOM_ID = process.env.STRATEGIC_CSS_ROOM_ID;
let BOT_PERSON_ID = "";

const formMap = {
  deployment: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")),
  picker: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8")),
  handoff: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "secureAccessHandoffForm.json"), "utf8"))
};

// Helper function to validate form data
function validateFormData(formData, requiredFields) {
  for (const field of requiredFields) {
    if (!formData[field]) {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

// Generate summary function
function generateSummary(formData, customerName, submitterEmail) {
  return `
  **Secure Access Checklist Submission**

  - **Customer Name**: ${customerName}
  - **Submitted By**: ${submitterEmail}
  - **Adoption Blockers**: ${formData.adoptionBlockers || "None"}

  📝 *Please review the submission for completeness.*
  `;
}

// Test endpoint
app.get("/test", async (req, res) => {
  try {
    const botInfo = await axios.get("https://webexapis.com/v1/people/me", {
      headers: { Authorization: WEBEX_BOT_TOKEN }
    });
    res.send({
      status: "✅ SSE-CX-Hub bot is up and running",
      botDetails: botInfo.data
    });
  } catch (err) {
    console.error("❌ Failed to fetch bot info:", err.response?.data || err.message);
    res.status(500).send("Failed to fetch bot info.");
  }
});

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  console.log("🔥 Incoming webhook hit");
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

      console.log("Processing a form submission...");
      console.log("formData:", formData);

      const missingFieldError = validateFormData(formData, ["customerName", "submittedBy"]);
      if (missingFieldError) {
        return res.status(400).send(missingFieldError);
      }

      const customerName = formData.customerName;
      const submitterEmail = formData.submittedBy;

      const summary = generateSummary(formData, customerName, submitterEmail);

      await axios.post("https://webexapis.com/v1/messages", {
        roomId: STRATEGIC_CSS_ROOM_ID,
        markdown: summary
      }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

      console.log("✅ Summary posted to Strategic CSS Room.");
      res.sendStatus(200);
    }
  } catch (err) {
    console.error("❌ Webhook error:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

// Start the bot
async function startBot() {
  try {
    const res = await axios.get("https://webexapis.com/v1/people/me", {
      headers: { Authorization: WEBEX_BOT_TOKEN }
    });
    BOT_PERSON_ID = res.data.id;
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 SSE-CX-Hub listening on port ${PORT}`));
  } catch (err) {
    console.error("❌ Failed to get bot info:", err.response?.data || err.message);
    process.exit(1);
  }
}

startBot();
