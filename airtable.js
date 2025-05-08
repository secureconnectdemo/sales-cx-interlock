const Airtable = require('airtable');
require('dotenv').config();

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

async function getAccountsWithBarrier(barrierType) {
  const records = await base('Accounts')
    .select({
      filterByFormula: `{Barrier Type} = '${barrierType}'`,
      fields: ['Account Name']
    })
    .firstPage();

  return records.map(record => ({
    title: record.get('Account Name') || 'Unnamed',
    value: record.id
  }));
}

module.exports = { getAccountsWithBarrier };
const Airtable = require("airtable");
require("dotenv").config();

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

// Get onboarding steps due soon and not completed
async function getUpcomingIncompleteSteps() {
  const records = await base('tblJfWTk7VT3qLAjl').select({
    filterByFormula: "AND(NOT({Completed}), {Days Until Due} <= 7)",
    fields: [
      "Step Name",
      "Due Date",
      "Assigned To",
      "Customer Name",
      "Days Until Due"
    ],
    maxRecords: 20,
    sort: [{ field: "Due Date", direction: "asc" }]
  }).firstPage();

  return records.map(record => ({
    id: record.id,
    step: record.get("Step Name"),
    due: record.get("Due Date"),
    assigned: record.get("Assigned To"),
    customer: (record.get("Customer Name") || []).join(", "),
    daysUntilDue: record.get("Days Until Due")
  }));
}

module.exports = { getUpcomingIncompleteSteps };
