const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

/**
 * Polls Hostinger IMAP mailbox for Facebook confirmation OTP code.
 * Checks both INBOX and INBOX.Junk (since Hostinger often moves auth emails to Spam).
 * 
 * @param {string} targetEmail - The email address submitted on Facebook
 * @param {number} timeoutMs - Max wait time in milliseconds (default 90 seconds)
 * @returns {Promise<{otp: string, confirmUrl: string|null}>}
 */
async function waitForFacebookOtp(targetEmail, timeoutMs = 90000) {
  // Use direct Hostinger IP if imap.hostinger.com fails DNS on local network
  const host = process.env.HOSTINGER_IMAP_HOST === 'imap.hostinger.com' || !process.env.HOSTINGER_IMAP_HOST 
    ? '172.65.188.64' 
    : process.env.HOSTINGER_IMAP_HOST;
  const port = parseInt(process.env.HOSTINGER_IMAP_PORT || '993', 10);
  const user = process.env.HOSTINGER_EMAIL;
  const pass = process.env.HOSTINGER_PASSWORD;

  if (!user || !pass) {
    throw new Error('HOSTINGER_EMAIL and HOSTINGER_PASSWORD must be configured in .env file!');
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    tls: { servername: 'imap.hostinger.com' },
    auth: { user, pass },
    logger: false
  });

  const startTime = Date.now();
  console.log(`[*] Waiting for Facebook confirmation email for: ${targetEmail}`);

  await client.connect();

  try {
    while (Date.now() - startTime < timeoutMs) {
      const mailboxes = ['INBOX', 'INBOX.Junk', 'Junk', 'Spam'];

      for (const mailbox of mailboxes) {
        let lock;
        try {
          lock = await client.getMailboxLock(mailbox);
        } catch (e) {
          continue;
        }

        try {
          const messages = client.fetch({ seq: '1:*' }, { envelope: true, source: true });
          const fetchedList = [];
          for await (const msg of messages) {
            fetchedList.push(msg);
          }
          fetchedList.reverse();

          for (const msg of fetchedList.slice(0, 10)) {
            const parsed = await simpleParser(msg.source);
            const subject = parsed.subject || '';
            const text = parsed.text || '';
            const html = parsed.html || '';
            const fullContent = `${subject}\n${text}\n${html}`;

            const isFromFacebook = 
              /facebook/i.test(parsed.from?.text || '') || 
              /facebookmail\.com/i.test(parsed.from?.text || '') ||
              /facebook/i.test(subject);

            if (isFromFacebook) {
              let otp = null;
              const fbMatch = fullContent.match(/\bFB-(\d{5})\b/i);
              if (fbMatch) {
                otp = fbMatch[1];
              } else {
                const subjMatch = subject.match(/\b(\d{5})\b/);
                if (subjMatch) {
                  otp = subjMatch[1];
                } else {
                  const bodyMatch = text.match(/\b(\d{5})\b/);
                  if (bodyMatch) {
                    otp = bodyMatch[1];
                  }
                }
              }

              let confirmUrl = null;
              const linkMatch = fullContent.match(/https?:\/\/[^\s<>"]*facebook\.com\/n\/\?confirmemail[^\s<>"]*/i);
              if (linkMatch) {
                confirmUrl = linkMatch[0];
              }

              if (otp) {
                console.log(`[SUCCESS] Found Facebook OTP: ${otp} (Folder: ${mailbox})`);
                return { otp, confirmUrl };
              }
            }
          }
        } finally {
          lock.release();
        }
      }

      await new Promise(r => setTimeout(r, 4000));
    }

    throw new Error('Timeout: Facebook verification email not received within time limit.');
  } finally {
    await client.logout();
  }
}

module.exports = { waitForFacebookOtp };
