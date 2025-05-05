// ✫️ Interactive /Playcards Command Node.js Bot

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

function normalizeARR(arrTier) {
  switch (arrTier) {
    case "$200K+": return "200K_PLUS";
    case "$50K - $200K": return "50K_200K";
    case "$0 - $50K": return "0_50K";
    default: return arrTier.replace(/\W+/g, "_").toUpperCase();
  }
}

app.get("/test", (req, res) => {
  res.send("✅ SSE-CX-Hub bot is up and running");
});

app.post("/webhook", async (req, res) => {
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

      if (text.startsWith("/playcard")) {
        const [, segmentRaw, ...taskParts] = text.split(" ");
        const segment = capitalize(segmentRaw);
        const task = taskParts.join(" ").replace(/-/g, " ");
        const card = getPlaycard(segment, task);

        if (card) {
          const response = `**${segment} - ${task}**\n\n**Owner:** ${card.owner}\n**Title:** ${card.title}\n\n${(card.description || []).map(d => "- " + d).join("\n")}`;
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: response
          }, {
            headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
          });
        } else {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: `❌ No playcard found for segment **${segment}** and task **${task}**.`
          }, {
            headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
          });
        }
        return res.sendStatus(200);
      }

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

    if (resource === "attachmentActions") {
      const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
        headers: { Authorization: WEBEX_BOT_TOKEN }
      });
      const formData = actionRes.data.inputs;

      if (formData.action === "selectSegment") {
        const segment = formData.segment;
        const playcardModule = require("./playcards");
        const tasks = Object.keys(playcardModule[segment] || {});
        const taskCard = {
          type: "AdaptiveCard",
          version: "1.3",
          body: [
            { type: "TextBlock", text: `Select a task for ${segment}`, weight: "Bolder" },
            {
              type: "Input.ChoiceSet",
              id: "task",
              style: "compact",
              choices: tasks.map(t => ({ title: t, value: t }))
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
          markdown: `📋 Select a task for **${segment}**:",
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

        if (card) {
          const response = `**${segment} - ${task}**\n\n**Owner:** ${card.owner}\n**Title:** ${card.title}\n\n${(card.description || []).map(d => "- " + d).join("\n")}`;
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: response
          }, {
            headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
          });
        } else {
          await axios.post("https://webexapis.com/v1/messages", {
            roomId,
            markdown: `❌ No playcard found for **${segment} – ${task}**.`
          }, {
            headers: { Authorization: WEBEX_BOT_TOKEN, "Content-Type": "application/json" }
          });
        }
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

startBot = async () => {
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
};

startBot();
