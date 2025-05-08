const { getPlaycard } = require("./playcards");
const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");
const { addHandoffEntry } = require("./sheet");

const app = express();
app.use(express.json());

const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
let BOT_PERSON_ID = "";

const regionARRRoomMap = {
  "AMER_200K_PLUS": "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1",
  "DEFAULT": "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1"
};

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

   // ✅ /submit deployment
if (text === "/submit deployment") {
  console.log("📨 Matched '/submit deployment' command");

  try {
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


      // /playcard segment task-name
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

      // /playcards interactive picker
      if (text === "/playcards") {
        const segmentCard = {
          type: "AdaptiveCard",
          version: "1.3",
          body: [
            {
              type: "TextBlock",
              text: "Select a Segment",
              weight: "Bolder"
            },
            {
              type: "Input.ChoiceSet",
              id: "segment",
              style: "compact",
              choices: [
                { title: "Digital", value: "Digital" },
                { title: "Scale", value: "Scale" },
                { title: "Enterprise", value: "Enterprise" }
              ]
            }
          ],
          actions: [
            {
              type: "Action.Submit",
              title: "Next",
              data: { action: "selectSegment" }
            }
          ]
        };

        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: "📋 Choose a segment to view tasks:",
          attachments: [{
            contentType: "application/vnd.microsoft.card.adaptive",
            content: segmentCard
          }]
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });
        return res.sendStatus(200);
      }
    }

    // Adaptive Card Responses
    if (resource === "attachmentActions") {
      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });
      const formData = actionRes.data.inputs;

      if (formData.action === "selectSegment") {
        const segment = formData.segment;
        const playcardModule = require("./playcards");
        const segmentData = playcardModule[segment];

        if (!segmentData) {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: `❌ No tasks found for segment **${segment}**.`
          }, {
            headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
          });
          return res.sendStatus(200);
        }

        const taskCard = {
          type: "AdaptiveCard",
          version: "1.3",
          body: [
            { type: "TextBlock", text: `Select a task for ${segment}`, weight: "Bolder" },
            {
              type: "Input.ChoiceSet",
              id: "task",
              style: "compact",
              choices: Object.keys(segmentData).map(t => ({ title: t, value: t }))
            }
          ],
          actions: [
            {
              type: "Action.Submit",
              title: "Show Playcard",
              data: { action: "selectTask", segment }
            }
          ]
        };

        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: `📋 Select a task for **${segment}**:`,
          attachments: [{
            contentType: "application/vnd.microsoft.card.adaptive",
            content: taskCard
          }]
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });
        return res.sendStatus(200);
      }

      if (formData.action === "selectTask") {
        const segment = formData.segment;
        const task = formData.task;
        const card = getPlaycard(segment, task);

        const response = card
          ? `**${segment} - ${task}**\n\n**Owner:** ${card.owner}\n**Title:** ${card.title}\n\n${(card.description || []).map(d => "- " + d).join("\n")}`
          : `❌ No playcard found for **${segment} – ${task}**.`;

        await axios.post("https://webexapis.com/v1/messages", {
          roomId,
          markdown: response
        }, {
          headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
        });
        return res.sendStatus(200);
      }

      // Form Submission Handler (Optional)
    if (formData.formType === "deployment") {
  const normalizedARR = normalizeARR(formData.arrTier);
  const key = `${formData.region}_${normalizedARR}`;
  const targetRoom = regionARRRoomMap[key] || regionARRRoomMap["DEFAULT"];

  const summary = `**📦 Secure Access - Onboard & Deployment Notification**

👤 **Customer:** ${formData.customerName}  
🆔 **Org ID:** ${formData.orgId}  
📊 **Total Licenses:** ${formData.totalLicenses}  
🚀 **Already Deployed:** ${formData.alreadyDeployed || "N/A"}  
📅 **Planned Rollout:** ${formData.plannedRollout}  
📍 **Deployment Plan Info:**  
${formData.deploymentPlan}  
📎 **File Upload Info:** ${formData.fileUploadInfo || "To be sent"}`;

  await addHandoffEntry(formData);

  // ✅ Notify ARR-targeted room
  await axios.post("https://webexapis.com/v1/messages", {
    roomId: targetRoom,
    markdown: summary
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });

  // ✅ Also notify "Capacity Planning" room
  const CAPACITY_PLANNING_ROOM_ID = "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1";
  await axios.post("https://webexapis.com/v1/messages", {
    roomId: CAPACITY_PLANNING_ROOM_ID,
    markdown: `📢 **New Form Submission Notification**

👤 **Customer:** ${formData.customerName}  
🆔 **Org ID:** ${formData.orgId}  
📅 **Planned Rollout:** ${formData.plannedRollout}  
📍 **Deployment Plan:** ${formData.deploymentPlan}`
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });

  // ✅ Acknowledge user in the original chat
  await axios.post("https://webexapis.com/v1/messages", {
    roomId,
    markdown: `✅ Submission received for *${formData.customerName}*.`
  }, {
    headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
  });

  return res.sendStatus(200);
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
   const PORT = process.env.PORT || 10000; // must match Render-assigned port
    app.listen(PORT, () => console.log(`🚀 SSE-CX-Hub listening on port ${PORT}`));
  } catch (err) {
    console.error("❌ Failed to get bot info:", err.response?.data || err.message);
    process.exit(1);
  }
}

startBot();
