const { google } = require("googleapis");

// ✅ Load credentials from Render environment
const keys = JSON.parse(process.env.GOOGLE_CREDS);

// 🔐 Auth setup using JWT
const auth = new google.auth.JWT(
  keys.client_email,
  null,
  keys.private_key,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

// 📊 Google Sheets instance
const sheets = google.sheets({ version: "v4", auth });

// 📌 Target Sheet & Range
const SPREADSHEET_ID = "1SbihsAk6t_6J8psGa2nHxtywqAsysvM-AsppQ_me3EM";
const RANGE = "Sheet1!A2:M"; // Assuming Row 1 has headers

// 🚀 Append one handoff row
async function addHandoffEntry(formData) {
  console.log("📄 Preparing to write to Google Sheet...");
  console.log("📋 Incoming formData:", JSON.stringify(formData, null, 2));

  const values = [[
    new Date().toLocaleString(),
    formData.salesRep || "",
    formData.customerName || "",
    formData.product || "",
    formData.useCases || "",
    formData.customerPOC || "",
    formData.region || "",
    formData.urgency || "",
    formData.notes || "",
    formData.pocConfirmed || "",
    formData.pmPromise || "",
    formData.seededNFR || formData.nfrStatus || "", // fallback
    formData.followUpDate || formData.followUpNeeded || "" // fallback
  ]];

  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
      valueInputOption: "USER_ENTERED",
      resource: { values }
    });
    console.log("✅ Google Sheet append success:", response.statusText);
  } catch (error) {
    console.error("❌ Google Sheet append failed:", error.response?.data || error.message);
  }
}

module.exports = { addHandoffEntry };

