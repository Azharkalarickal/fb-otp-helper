require('dotenv').config();
const { ImapFlow } = require('imapflow');

async function testConnection() {
  const host = process.env.HOSTINGER_IMAP_HOST || 'imap.hostinger.com';
  const port = parseInt(process.env.HOSTINGER_IMAP_PORT || '993', 10);
  const user = process.env.HOSTINGER_EMAIL;
  const pass = process.env.HOSTINGER_PASSWORD;

  console.log('Testing Hostinger IMAP Connection...');
  console.log(`Server: ${host}:${port}`);
  console.log(`User: ${user ? user : '(not set in .env!)'}`);

  if (!user || !pass) {
    console.error('\n[ERROR] ദയവായി .env ഫയലിൽ HOSTINGER_EMAIL, HOSTINGER_PASSWORD എന്നിവ നൽകുക.');
    process.exit(1);
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false
  });

  try {
    await client.connect();
    console.log('\n[SUCCESS] Hostinger IMAP-ലേക്ക് വിജയകരമായി കണക്ട് ചെയ്തു!');

    const lock = await client.getMailboxLock('INBOX');
    try {
      const status = await client.status('INBOX', { messages: true, unseen: true });
      console.log(`ഇൻബോക്സിലെ വിവരങ്ങൾ:`);
      console.log(`- ആകെ മെയിലുകൾ (Total messages): ${status.messages}`);
      console.log(`- വായിക്കാത്ത മെയിലുകൾ (Unread messages): ${status.unseen}`);
    } finally {
      lock.release();
    }

    await client.logout();
    console.log('[SUCCESS] ടെസ്റ്റ് പൂർത്തിയായി. ക്രഡൻഷ്യൽസ് കൃത്യമാണ്!');
  } catch (err) {
    console.error('\n[ERROR] കണക്ഷൻ പരാജയപ്പെട്ടു:', err.message);
    console.error('ദയവായി ഇമെയിലും പാസ്‌വേർഡും ശരിയാണോ എന്ന് പരിശോധിക്കുക.');
  }
}

testConnection();
