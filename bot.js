const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { addHandoffEntry } = require("./sheet");
const keys = require("./credentials.json");

const app = express();
app.use(bodyParser.json());

const WEBEX_BOT_TOKEN = "Bearer YOUR_WEBEX_BOT_TOKEN";

async function handleHandoffSubmission(roomId, formData) {
  await addHandoffEntry(formData);

  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: `✅ Sales handoff submitted for *${formData.customerName}*. Thank you!`
  }, {
    headers: {
      Authorization: WEBEX_BOT_TOKEN,
      "Content-Type": "application/json"
    }
  });
}

app.post("/webhook", async (req, res) => {
  const { data, resource } = req.body;
  const roomId = data?.roomId;

  try {
    if (resource === "attachmentActions") {
      const actionId = data.id;
      const actionRes = await axios.get(\`https://webexapis.com/v1/attachment/actions/\${actionId}\`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });

      const formData = actionRes.data.inputs;
      await handleHandoffSubmission(roomId, formData);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Bot error:", error.response?.data || error.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`🚀 Sales-CX-Interlock bot listening on port \${PORT}\`));
