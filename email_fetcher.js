const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

// Helper to safely extract string from mailparser headers
function getHeaderSafeString(headers, key) {
  if (!headers || typeof headers.get !== 'function') return '';
  const val = headers.get(key);
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    if (typeof val.value === 'string') return val.value;
    if (typeof val.text === 'string') return val.text;
    if (Array.isArray(val.value)) {
      return val.value.map(v => (v && (v.address || v.text)) || '').join(' ');
    }
  }
  return String(val);
}

/**
 * Polls Hostinger IMAP mailbox for Facebook confirmation OTP code.
 * Strictly verifies the recipient email and ensures the email is fresh.
 * 
 * @param {string} targetEmail - The exact email address submitted on Facebook
 * @param {number} timeoutMs - Max wait time in milliseconds (default 120 seconds)
 * @returns {Promise<{otp: string, confirmUrl: string|null}>}
 */
async function waitForFacebookOtp(targetEmail, timeoutMs = 120000) {
  if (!targetEmail) {
    throw new Error('Target email is required!');
  }

  const targetLower = targetEmail.trim().toLowerCase();

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

  const requestStartTime = Date.now();
  console.log(`[*] Polling Hostinger for fresh Facebook OTP for target: ${targetLower}`);

  await client.connect();

  try {
    while (Date.now() - requestStartTime < timeoutMs) {
      const mailboxes = ['INBOX', 'INBOX.Junk', 'Junk', 'Spam'];

      for (const mailbox of mailboxes) {
        let lock;
        try {
          lock = await client.getMailboxLock(mailbox);
        } catch (e) {
          continue;
        }

        try {
          const mboxStatus = await client.status(mailbox, { messages: true });
          if (!mboxStatus.messages || mboxStatus.messages === 0) {
            continue;
          }

          // Fetch only the latest 15 messages for optimal speed and reliability
          const startSeq = Math.max(1, mboxStatus.messages - 15);
          const messages = client.fetch({ seq: `${startSeq}:*` }, { envelope: true, source: true });

          const fetchedList = [];
          for await (const msg of messages) {
            fetchedList.push(msg);
          }
          fetchedList.reverse(); // Newest messages first

          for (const msg of fetchedList) {
            const parsed = await simpleParser(msg.source);
            const subject = parsed.subject || '';
            const text = parsed.text || '';
            const html = parsed.html || '';
            const fullContent = `${subject}\n${text}\n${html}`;

            // 1. Verify Sender is Facebook
            const isFromFacebook = 
              /facebook/i.test(parsed.from?.text || '') || 
              /facebookmail\.com/i.test(parsed.from?.text || '') ||
              /facebook/i.test(subject);

            if (!isFromFacebook) continue;

            // 2. STRICT CHECK: Must match the requested target email!
            let isTargetRecipient = false;

            // Check envelope.to
            if (msg.envelope && Array.isArray(msg.envelope.to)) {
              isTargetRecipient = msg.envelope.to.some(to => 
                to && to.address && String(to.address).toLowerCase() === targetLower
              );
            }

            // Check parsed.to
            if (!isTargetRecipient && parsed.to) {
              const toText = String(parsed.to.text || '').toLowerCase();
              if (toText.includes(targetLower)) {
                isTargetRecipient = true;
              } else if (Array.isArray(parsed.to.value)) {
                isTargetRecipient = parsed.to.value.some(to => 
                  to && to.address && String(to.address).toLowerCase() === targetLower
                );
              }
            }

            // Check delivered-to or x-original-to headers safely
            if (!isTargetRecipient && parsed.headers) {
              const deliv = getHeaderSafeString(parsed.headers, 'delivered-to').toLowerCase();
              const orig = getHeaderSafeString(parsed.headers, 'x-original-to').toLowerCase();
              if (deliv.includes(targetLower) || orig.includes(targetLower)) {
                isTargetRecipient = true;
              }
            }

            // Fallback check: target email present anywhere in full content
            if (!isTargetRecipient && fullContent.toLowerCase().includes(targetLower)) {
              isTargetRecipient = true;
            }

            // If this email belongs to another recipient, skip and keep checking!
            if (!isTargetRecipient) {
              continue;
            }

            // 3. FRESHNESS CHECK: Must be recent (received within last 10 minutes)
            const msgDate = parsed.date ? new Date(parsed.date).getTime() : 0;
            if (msgDate > 0 && (Date.now() - msgDate) > 10 * 60 * 1000) {
              console.log(`[SKIP] Stale OTP email found for ${targetLower} from ${new Date(msgDate).toLocaleTimeString()}`);
              continue;
            }

            // 4. Extract OTP
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
              console.log(`[SUCCESS] Found Facebook OTP ${otp} specifically for: ${targetLower} (Folder: ${mailbox})`);
              return { otp, confirmUrl };
            }
          }
        } finally {
          lock.release();
        }
      }

      // Wait 3 seconds before next poll
      await new Promise(r => setTimeout(r, 3000));
    }

    throw new Error(`Timeout: No new Facebook verification email received for ${targetLower} within time limit.`);
  } finally {
    await client.logout();
  }
}

module.exports = { waitForFacebookOtp };
