// bot.js
const {
  loadCatalog,
  buildSubscriptionPickerCard,
  buildTaskPickerCard,
  buildChecklistMarkdown,
  loadSubChecklistMap,
  buildHandoffSubPickerCard,
  buildTrimmedHandoffForm,
} = require("./utils/cards");

const Airtable = require("airtable");
const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");

// ---------- Airtable ----------
Airtable.configure({
  endpointUrl: "https://api.airtable.com",
  apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN,
});
const base = Airtable.base("appG1ZNhb2KRKQQOI");

// ---------- App ----------
const app = express();
app.use(express.json());

// ---------- Webex helpers ----------
const WEBEX_BOT_TOKEN = `Bearer ${process.env.WEBEX_BOT_TOKEN}`;
let BOT_PERSON_ID = "";

const sendText = (roomId, text) =>
  axios.post("https://webexapis.com/v1/messages", { roomId, text }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

const sendMarkdown = (roomId, markdown) =>
  axios.post("https://webexapis.com/v1/messages", { roomId, markdown }, { headers: { Authorization: WEBEX_BOT_TOKEN } });

const postCard = (roomId, markdown, card) =>
  axios.post(
    "https://webexapis.com/v1/messages",
    { roomId, markdown, attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }] },
    { headers: { Authorization: WEBEX_BOT_TOKEN } }
  );

const isTrue = (v) => v === true || v === "true" || v === "on";

// ---------- Rooms / forms ----------
const STRATEGIC_CSS_ROOM_ID =
  "Y2lzY29zcGFyazovL3VzL1JPT00vMTlhNjE0YzAtMTdjYi0xMWYwLWFhZjUtNDExZmQ2MTY1ZTM1";

const STRATEGIC_CSS_ROOM_TITLE = process.env.STRATEGIC_CSS_ROOM_TITLE || "Strategic CSS";
let strategicRoomIdCache = process.env.STRATEGIC_CSS_ROOM_ID || STRATEGIC_CSS_ROOM_ID;

async function resolveRoomIdByTitle(title) {
  const res = await axios.get("https://webexapis.com/v1/rooms?type=group&max=1000", {
    headers: { Authorization: WEBEX_BOT_TOKEN },
  });
  const room = (res.data.items || []).find(
    (r) => (r.title || "").trim().toLowerCase() === title.toLowerCase()
  );
  if (!room) throw new Error(`Room titled "${title}" not found or bot lacks access`);
  return room.id;
}

async function ensureMembership(roomId) {
  try {
    await axios.post(
      "https://webexapis.com/v1/memberships",
      { roomId, personId: BOT_PERSON_ID },
      { headers: { Authorization: WEBEX_BOT_TOKEN } }
    );
  } catch (e) {
    if (e.response?.status !== 409) {
      console.warn("Membership check/add failed:", e.response?.data || e.message);
    }
  }
}

async function postToStrategic(markdown) {
  // Try cached/constant ID first
  try {
    await ensureMembership(strategicRoomIdCache);
    await sendMarkdown(strategicRoomIdCache, markdown);
    return;
  } catch (e) {
    const payload = e.response?.data || e.message;
    const idProblem = e.response?.status === 404 || /could not find a room/i.test(String(payload));
    if (!idProblem) throw e;
    console.warn("Strategic post failed with cached ID; re-resolving:", payload);
  }
  // Fallback: resolve by title, cache, ensure membership, retry
  strategicRoomIdCache = await resolveRoomIdByTitle(STRATEGIC_CSS_ROOM_TITLE);
  await ensureMembership(strategicRoomIdCache);
  await sendMarkdown(strategicRoomIdCache, markdown);
}

const formMap = {
  deployment: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "engineeringDeploymentForm.json"), "utf8")),
  picker: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "formPickerCard.json"), "utf8")),
  handoff: JSON.parse(fs.readFileSync(path.join(__dirname, "forms", "secureAccessHandoffForm.json"), "utf8")),
};

// ---------- Scoring / summary helpers ----------
function calculateChecklistScore(data, ids) {
  const defaultIds = [
    "pla_1","pla_2","con_1","con_2","con_3","con_5","con_6",
    "pol_1","pol_2","pol_3","pol_4","pol_5","vis_2","vis_3",
    "ope_3","ope_4","ope_5","suc_1","suc_2","suc_3"
  ];
  const list = (ids && ids.length) ? ids : defaultIds;
  const completed = list.filter((id) => isTrue(data[id])).length;
  return Math.round((completed / list.length) * 100);
}

function calculateOverallScore(data, ids) {
  let score = calculateChecklistScore(data, ids);
  const blockerRawValues = (data.adoptionBlockers || "").split(",").map((b) => b.trim()).filter(Boolean);
  for (const b of blockerRawValues) {
    if (b.includes("high-")) score -= 25;
    else if (b.includes("med-")) score -= 10;
    else if (b.includes("low-")) score -= 5;
  }
  return Math.max(score, 0);
}

function capitalize(str) {
  return (str || "").charAt(0).toUpperCase() + (str || "").slice(1).toLowerCase();
}
const esc = (s) => (s || "").replace(/([*_`~>|[\]()])/g, "\\$1");

function generateSummary(data, customer, submitter, onboardingScore, overallScore, subLabel = null) {
  const score = overallScore;
  const riskLevel = score <= 25 ? "Critical" : score <= 50 ? "High" : score <= 75 ? "Medium" : "Low";
  const riskEmoji = riskLevel === "Critical" ? "🔴" : riskLevel === "High" ? "🟠" : riskLevel === "Medium" ? "🟡" : "🟢";

  const checklistItems = [
    { id: "pla_1", label: "Secure Access dashboard admin access granted" },
    { id: "pla_2", label: "User roles and permissions reviewed and adjusted" },
    { id: "con_1", label: "Root Cert deployed and Connectivity established" },
    { id: "con_2", label: "DNS redirection active and verified" },
    { id: "con_3", label: "At least one Rule configured and active" },
    { id: "con_5", label: "Experience Insights enabled and confirmed" },
    { id: "con_6", label: "SaaS tenant integrations configured and validated" },
    { id: "pol_1", label: "Web profiles reviewed" },
    { id: "pol_2", label: "Decryption enabled and Do Not Decrypt list explained" },
    { id: "pol_3", label: "DLP/ RBI/ IPS settings reviewed" },
    { id: "pol_4", label: "VPN profiles and posture settings transferred" },
    { id: "pol_5", label: "Customer has interacted with the AI Assistant" },
    { id: "vis_2", label: "Schedule reports configured for key stakeholders" },
    { id: "vis_3", label: "Block hit data explained and correlated to policy efficacy" },
    { id: "ope_3", label: "Owner shown how to engage Cisco Support/TAC" },
    { id: "ope_4", label: "Customer is aware of post-onboarding support" },
    { id: "ope_5", label: "Customer is subscribed to SA newsletter and Cisco Community" },
    { id: "suc_1", label: "Original business outcomes reviewed with IT owner" },
    { id: "suc_2", label: "Pilot use case confirmed as delivered" },
    { id: "suc_3", label: "Additional features identified (Optimize/Expand phase)" },
  ];

  const followups =
    checklistItems
      .filter((item) => !isTrue(data[item.id]))
      .map((item) => `❗ ${item.label}`)
      .join("\n") || "✅ All items completed.";

  const blockerLabels = {
    "high-budget": "🔴 No Budget / Not a Priority",
    "high-infra": "🔴 Infrastructure Not Ready",
    "high-ga": "🔴 Product Not GA or Missing Features",
    "med-training": "🟠 Training or Configuration Support Needed",
    "med-complex": "🟠 Customer Perceives Product as Complex",
    "med-partner": "🟠 Partner Unresponsive or Unenabled",
    "low-doc": "🟢 Documentation Not Found",
    "low-contact": "🟢 Invalid or Missing Contact Info",
    "low-plan": "🟢 Ownership or Success Plan Unclear",
  };

  const blockerRawValues = (data.adoptionBlockers || "").split(",").map((b) => b.trim()).filter(Boolean);
  const blockerDisplayText = blockerRawValues.map((b) => `• ${blockerLabels[b] || esc(b)}`).join("\n") || "None";
  const expansion = (data.expansionInterests || "").split(",").filter(Boolean).map((i) => `• ${esc(i.trim())}`).join("\n") || "None";
  const primaryUseCases = (data.primaryUseCases || "").split(",").filter(Boolean).map((u) => `• ${esc(u.trim())}`).join("\n") || "None";

  const subLine = subLabel ? `- **Subscription:** ${esc(subLabel)}` : "";

  return `
✅ **Secure Access Handoff Summary**
${subLine}
- **Customer Name:** ${esc(capitalize(customer))}
- **Submitted By:** ${esc(submitter)}
- **Primary Use Cases:**\n${primaryUseCases}
- **Onboarding Score (Checklist):** ${onboardingScore}/100
- **Overall Score (Adjusted):** ${overallScore}/100
- **Risk Level:** ${riskEmoji} ${riskLevel}
- **Customer Pulse:** ${esc(data.customerPulse || "N/A")}
- **Account Status:** ${esc(data.accountStatus || "N/A")}
- **Open Tickets:** ${esc(data.openTickets || "None")}
- **Customer Org ID:** ${esc(data.orgId || "N/A")}
- **Updated Customer Contacts:** ${esc(data.updatedContacts || "None")}

🔎 **Adoption Blockers:**
${blockerDisplayText}

🛠️ **Items Requiring Follow-Up:**
${followups}

📈 **Customer Interested in Exploring:**
${expansion}

🔗 **Action Plan Link:** ${data.actionPlanLink ? `[Open Action Plan](${data.actionPlanLink})` : "N/A"}
📅 **Action Plan Close Date:** ${esc(data.actionPlanCloseDate || "N/A")}

🗒️ **Additional Comments:**
> ${esc(data.comments || "None")}`;
}

// ---------- Routes ----------
app.get("/test", (req, res) => {
  res.send("✅ SSE-CX-Hub bot is up and running");
});

app.post("/webhook", async (req, res) => {
  const { data, resource } = req.body;
  const roomId = data?.roomId;
  const roomType = data?.roomType;
  const messageId = data?.id;
  if (!roomId || !messageId) return res.sendStatus(400);

  // ACK quickly
  res.sendStatus(200);

  setImmediate(async () => {
    try {
      if (resource === "messages") {
        const messageRes = await axios.get(`https://webexapis.com/v1/messages/${messageId}`, {
          headers: { Authorization: WEBEX_BOT_TOKEN },
        });
        if (messageRes.data.personId === BOT_PERSON_ID) return;

        const raw = (messageRes.data.markdown || messageRes.data.text || "").trim();
        const lines = raw.split("\n").map(l => l.replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean);

        const mentioned = (data?.mentionedPeople || []).some((id) => id.toLowerCase() === BOT_PERSON_ID.toLowerCase());
        const isDirect = roomType === "direct";
        if (!mentioned && !isDirect) return;

        const hasCmd = (cmd) => lines.some((l) => l === cmd || l.includes(` ${cmd}`) || l.startsWith(cmd));

        if (hasCmd("/submit handoff")) {
          const subMap = loadSubChecklistMap();
          await postCard(roomId, "📋 Choose subscription for this handoff:", buildHandoffSubPickerCard(subMap));
          return;
        }

        if (hasCmd("/tasks")) {
          const catalog = loadCatalog();
          await postCard(roomId, "🧭 Pick a subscription to see relevant tasks.", buildSubscriptionPickerCard(catalog));
          return;
        }

        await sendMarkdown(roomId, "⚠️ Unknown command. Try `/tasks` or `/submit handoff`.");
        return;
      }

      if (resource === "attachmentActions")) return; // should never happen
    } catch (err) {
      console.error("❌ Error handling webhook:", err?.response?.data || err.message);
    }
  });
});

// Webex sends "attachmentActions" as separate webhook events
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // double-ACK to be safe
});

// Dedicated handler to keep logic clean
app.use(async (req, res, next) => {
  if (req.body?.resource !== "attachmentActions") return next();

  const { data } = req.body;
  const idPattern = /^[a-zA-Z0-9_-]+$/;
  if (!idPattern.test(data.id)) {
    console.error("Invalid attachment action id");
    return;
  }

  try {
    const actionRes = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
      headers: { Authorization: WEBEX_BOT_TOKEN },
    });
    const formData = actionRes.data.inputs || {};
    const replyRoomId = actionRes?.data?.roomId || req.body?.data?.roomId;

    // A) handoff subscription -> trimmed form
    if (formData.formType === "handoffSubscriptionSelect") {
      const subMap = loadSubChecklistMap();
      const subKey = formData.subscription;
      if (!subMap[subKey]) { await sendText(replyRoomId, "Unknown subscription."); return; }
      const trimmedForm = buildTrimmedHandoffForm(formMap.handoff, subKey, subMap);

      await axios.post(
        "https://webexapis.com/v1/messages",
        {
          roomId: replyRoomId,
          markdown: "📋 Please complete the **Secure Access Handoff** form:",
          attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: trimmedForm }],
        },
        { headers: { Authorization: WEBEX_BOT_TOKEN } }
      );
      return;
    }

    // B) /tasks subscription -> task picker
    if (formData.formType === "taskSubscriptionSelect") {
      const catalog = loadCatalog();
      const sub = formData.subscription;
      if (!catalog[sub]) { await sendText(replyRoomId, "Unknown subscription."); return; }
      await postCard(replyRoomId, "📋 Choose tasks:", buildTaskPickerCard(sub, catalog));
      return;
    }

    // C) /tasks submit -> checklist
    if (formData.formType === "taskListSubmit") {
      const selected = (formData.tasks || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!selected.length) { await sendText(replyRoomId, "No tasks selected."); return; }
      const msg = buildChecklistMarkdown(formData.subscription, selected);
      await sendMarkdown(replyRoomId, msg);

      try {
        await base("Task Selections").create([{
          fields: {
            Subscription: formData.subscription,
            Tasks: selected,
            "Submitted By": actionRes?.data?.personEmail || "",
          },
        }]);
      } catch (e) {
        console.error("Airtable log error:", e?.response?.data || e.message);
      }
      return;
    }

    // D) handoff submit -> score, summarize, log
    if (formData.formType === "secureAccessChecklist") {
      const subMap = loadSubChecklistMap();
      const subKey = formData.subscription || "SIA";
      const includeIds = subMap[subKey]?.includeIds || [];
      const subLabel = subMap[subKey]?.label || subKey;

      const customerName = formData.customerName || "";
      const submitterEmail = formData.submittedBy || "";
      const orgId = formData.orgId || "";
      const updatedContacts = formData.updatedContacts || "";

      const onboardingScore = calculateChecklistScore(formData, includeIds);
      const overallScore = calculateOverallScore(formData, includeIds);
      const summary = generateSummary(formData, customerName, submitterEmail, onboardingScore, overallScore, subLabel);

      try {
        await postToStrategic(summary);
      } catch (e) {
        console.warn("Post to Strategic room failed:", e?.response?.data || e.message);
        await sendMarkdown(replyRoomId, "⚠️ Couldn't post to Strategic CSS room. Check bot membership/room ID.");
      }

      await sendMarkdown(replyRoomId, "✅ Submission received and summary sent.");
      await sendMarkdown(replyRoomId, `📋 **Please copy/paste into Console case notes:**\n\n${summary}`);

      const parsedBlockers  = (formData.adoptionBlockers || "").split(",").map((v) => v.trim()).filter(Boolean);
      const parsedExpansion = (formData.expansionInterests || "").split(",").map((v) => v.trim()).filter(Boolean);
      const parsedUseCases  = (formData.primaryUseCases || "").split(",").map((v) => v.trim()).filter(Boolean);

      try {
        await base("Handoff Form").create([{
          fields: {
            "Customer Name": customerName,
            "Submitted By": submitterEmail,
            "Action Plan Link": formData.actionPlanLink || "",
            "Close Date": formData.actionPlanCloseDate || "",
            "Adoption Blockers": parsedBlockers,
            "Expansion Interests": parsedExpansion,
            "Primary Use Cases": parsedUseCases,
            "Strategic CSS": formData.strategicCss || "",
            Comments: formData.comments || "",
            "Customer Pulse": formData.customerPulse || "",
            "Account Status": formData.accountStatus || "",
            "Open Tickets": formData.openTickets || "",
            "Onboarding Score": onboardingScore,
            "Overall Score": overallScore,
            "Customer Org ID": orgId,
            "Updated Customer Contacts": updatedContacts,
            Subscription: subLabel, // keep only if this field exists in Airtable
          },
        }]);
      } catch (e) {
        console.error("Airtable create error (Handoff Form):", e?.response?.data || e.message);
      }
      return;
    }
  } catch (err) {
    console.error("❌ Error handling attachmentActions:", err?.response?.data || err.message);
  }
});

// ---------- Startup ----------
async function startBot() {
  try {
    const me = await axios.get("https://webexapis.com/v1/people/me", { headers: { Authorization: WEBEX_BOT_TOKEN } });
    BOT_PERSON_ID = me.data.id;

    // Try to resolve Strategic room at startup (best effort; postToStrategic will retry anyway)
    try {
      strategicRoomIdCache = await resolveRoomIdByTitle(STRATEGIC_CSS_ROOM_TITLE);
      await ensureMembership(strategicRoomIdCache);
    } catch (e) {
      console.warn("Startup room resolve/membership best-effort failed (will retry on post):", e?.response?.data || e.message);
    }

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log("🚀 SSE-CX-Hub bot is running on port", PORT));
  } catch (err) {
    console.error("❌ Failed to start bot:", err.message);
    process.exit(1);
  }
}

startBot();
