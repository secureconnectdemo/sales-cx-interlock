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
