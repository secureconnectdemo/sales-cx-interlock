const { google } = require("googleapis");
const keys = JSON.parse(process.env.GOOGLE_CREDS);

const auth = new google.auth.JWT(
  keys.client_email,
  null,
  keys.private_key,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = "1SbihsAk6t_6J8psGa2nHxtywqAsysvM-AsppQ_me3EM";
const RANGE = "Sheet1!A2:M"; // Assumes you have headers on Row 1

async function addHandoffEntry(formData) {
  console.log("📄 Writing to Google Sheet with values:", formData);

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
    formData.seededNFR || "",
    formData.followUpDate || ""
  ]];

  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
      valueInputOption: "USER_ENTERED",
      resource: { values }
    });
    console.log("✅ Google Sheet append response:", response.statusText);
  } catch (error) {
    console.error("❌ Google Sheet write failed:", error.message);
  }
}

module.exports = { addHandoffEntry };
