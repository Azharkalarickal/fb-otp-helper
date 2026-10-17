require('dotenv').config();
const express = require('express');
const path = require('path');
const { waitForFacebookOtp } = require('./email_fetcher');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. പുതിയ ഇമെയിൽ ഉണ്ടാക്കുന്ന എൻഡ്‌പോയിന്റ്
app.get('/api/generate-email', (req, res) => {
  const domain = process.env.DOMAIN || 'qudraw.com';
  const randomStr = Math.random().toString(36).substring(2, 8);
  const email = `fb_${randomStr}@${domain}`;
  res.json({ email });
});

// 2. Hostinger ഇൻബോക്സിൽ നിന്ന് ഫേസ്ബുക്ക് OTP ഫെച്ച് ചെയ്യുന്ന എൻഡ്‌പോയിന്റ്
app.post('/api/get-fb-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  console.log(`[API] Checking Facebook OTP for ${email}...`);
  try {
    const result = await waitForFacebookOtp(email, 120000); // 2 minutes timeout
    res.json({ success: true, otp: result.otp, confirmUrl: result.confirmUrl });
  } catch (error) {
    console.error('[API Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Facebook OTP Helper Dashboard Running:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`===============================================`);
});
