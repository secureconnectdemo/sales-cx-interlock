
const regionARRRoomMap = {
  "AMER_200K_PLUS": "WEBEX_ROOM_ID_1",
  "AMER_100K_200K": "WEBEX_ROOM_ID_2",
  "AMER_25K_100K": "WEBEX_ROOM_ID_3",
  "AMER_UNDER_25K": "WEBEX_ROOM_ID_4",

  "EMEA_200K_PLUS": "WEBEX_ROOM_ID_5",
  "EMEA_100K_200K": "WEBEX_ROOM_ID_6",
  "EMEA_25K_100K": "WEBEX_ROOM_ID_7",
  "EMEA_UNDER_25K": "WEBEX_ROOM_ID_8",

  "APJC_200K_PLUS": "WEBEX_ROOM_ID_9",
  "APJC_100K_200K": "WEBEX_ROOM_ID_10",
  "APJC_25K_100K": "WEBEX_ROOM_ID_11",
  "APJC_UNDER_25K": "WEBEX_ROOM_ID_12",

  "PREMIUM": "WEBEX_ROOM_ID_PREMIUM",
  "DEFAULT": "WEBEX_ROOM_ID_FALLBACK"
}
const express = require("express");
const axios = require("axios");
const { addHandoffEntry } = require("./sheet");

const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
const BOT_NAME_PREFIX = "secure access sales handoff process";

// 🔍 Health check
app.get("/test", (req, res) => {
  res.send("✅ Webex bot is up and reachable");
});

// 🧠 Send Adaptive Card
async function sendHandoffForm(roomId) {
  const handoffCard = {
    type: "AdaptiveCard",
    body: [
      { type: "TextBlock", text: "📋 Sales to Post-Sales Handoff", weight: "Bolder", size: "Medium" },
      { type: "Input.Text", id: "salesRep", placeholder: "Sales Rep" },
      { type: "Input.Text", id: "customerName", placeholder: "Customer Name" },
      {
        type: "Input.ChoiceSet",
        id: "product",
        placeholder: "Product",
        choices: [
          { title: "Secure Access", value: "Secure Access" },
          { title: "Umbrella", value: "Umbrella" },
          { title: "Duo", value: "Duo" },
          { title: "Suite", value: "Suite" }
        ]
      },
      { type: "Input.Text", id: "customerPOC", placeholder: "Customer POC (email)" },
      { type: "Input.Text", id: "useCases", placeholder: "Use Cases" },
      {
        type: "Input.ChoiceSet",
        id: "urgency",
        placeholder: "Urgency",
        choices: [
          { title: "Low", value: "Low" },
          { title: "Medium", value: "Medium" },
          { title: "High", value: "High" }
        ]
      },
      {
        type: "Input.ChoiceSet",
        id: "region",
        placeholder: "Select Region",
        choices: [
          { title: "AMER", value: "AMER" },
          { title: "EMEA", value: "EMEA" },
          { title: "APJC", value: "APJC" }
        ]
      },
      {
        type: "Input.ChoiceSet",
        id: "arrTier",
        placeholder: "Select ARR Tier",
        choices: [
          { title: "> $200K ARR", value: "200K_PLUS" },
          { title: "$100K – $200K ARR", value: "100K_200K" },
          { title: "$25K – $100K ARR", value: "25K_100K" },
          { title: "< $25K ARR", value: "UNDER_25K" },
          { title: "Premium (Any ARR with Premium Support)", value: "PREMIUM" }
        ]
      },
      { type: "Input.Text", id: "notes", placeholder: "Notes / PM involved? PoC? Advocacy restriction?" },
      {
        type: "Input.ChoiceSet",
        id: "followUpNeeded",
        placeholder: "Customer not ready – When to follow up?",
        choices: [
          { title: "2 Weeks", value: "2 Weeks" },
          { title: "1 Month", value: "1 Month" },
          { title: "Custom", value: "Custom" }
        ]
      },
      {
        type: "Input.ChoiceSet",
        id: "nfrStatus",
        placeholder: "Seeded or NFR?",
        choices: [
          { title: "Seeded", value: "Seeded" },
          { title: "NFR", value: "NFR" },
          { title: "None", value: "None" }
        ]
      }
    ],
    actions: [{ type: "Action.Submit", title: "Submit Handoff" }],
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.3"
  };

  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: "📝 Please complete the sales-to-CX handoff form:",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: handoffCard
    }]
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });
}

// 📩 Handle form submission
async function handleHandoffSubmission(roomId, formData) {
  console.log("📬 Received handoff form data:", formData);

  // Save to Google Sheet
  await addHandoffEntry(formData);

  // Prepare regional handoff summary
  const summary = `
**🧾 Sales to Post-Sales Handoff Summary**

📍 **Region:** ${formData.region}
💰 **ARR Tier:** ${formData.arrTier}
👤 **Sales Rep:** ${formData.salesRep}
🏢 **Customer:** ${formData.customerName}
📬 **Customer POC:** ${formData.customerPOC}
🔧 **Product:** ${formData.product}
🎯 **Use Cases:** ${formData.useCases}
🚨 **Urgency:** ${formData.urgency}
📝 **Notes:** ${formData.notes}
🌱 **Seeded/NFR:** ${formData.nfrStatus}
📅 **Follow Up:** ${formData.followUpNeeded}
`;

  const key = formData.arrTier === "PREMIUM" ? "PREMIUM" : `${formData.region}_${formData.arrTier}`;
  const targetRoom = regionARRRoomMap[key] || regionARRRoomMap["DEFAULT"];
  const regionARRRoomMap = {
    "AMER_200K_PLUS": "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1",
    "DEFAULT": "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1"
  };
  

  // Send summary to mapped Webex room
  await axios.post("https://webexapis.com/v1/messages", {
    roomId: targetRoom,
    markdown: summary
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });

  // Confirmation back to original sender room
  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: `✅ Sales handoff submitted for *${formData.customerName}*. Thank you!`
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });
}


// 🔁 Webhook: message or action handler
app.post("/webhook", async (req, res) => {
  console.log("📥 Incoming Webhook Event:");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("🌐 Full Headers:", JSON.stringify(req.headers, null, 2));

  const { data, resource } = req.body;
  const roomId = data?.roomId;

  if (!roomId) {
    console.warn("⚠️ Missing roomId in webhook payload");
    return res.sendStatus(400);
  }

  try {
    if (resource === "messages") {
      const messageRes = await axios.get(`https://webexapis.com/v1/messages/${data.id}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });

      let rawText = messageRes.data.text || "";
      let normalizedText = rawText.toLowerCase().trim();

      const botNameVariants = [
        "secure access sales handoff process",
        "secure access sales handoff",
        "secure access handoff"
      ];

      console.log("📥 Raw:", rawText);

      for (const variant of botNameVariants) {
        if (normalizedText.startsWith(variant)) {
          normalizedText = normalizedText.replace(variant, "").trim();
          break;
        }
      }

      console.log("💬 Normalized:", normalizedText);

      if (normalizedText.includes("submit handoff")) {
        console.log("📨 Trigger detected: submitting handoff card...");
        await sendHandoffForm(roomId);
        return res.sendStatus(200);
      }
    }

    if (resource === "attachmentActions") {
      console.log("📎 Attachment Action detected, pulling form inputs...");
      const actionId = data.id;

      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${actionId}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });

      console.log("✅ Form submission payload received:", actionRes.data.inputs);
      const formData = actionRes.data.inputs;
      await handleHandoffSubmission(roomId, formData);
      return res.sendStatus(200);
    }

    res.sendStatus(200); // Gracefully ignore other resource types
  } catch (error) {
    console.error("❌ Bot error:", error.response?.data || error.message);
    res.sendStatus(500);
  }
});

// 🔊 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Sales-CX-Interlock bot listening on port ${PORT}`);
});
