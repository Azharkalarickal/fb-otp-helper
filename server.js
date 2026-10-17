require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { waitForFacebookOtp } = require('./email_fetcher');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so other websites and apps can call this API
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 1. Generate new catch-all email address
app.get('/api/generate-email', (req, res) => {
  const domain = process.env.DOMAIN || 'qudraw.com';
  const randomStr = Math.random().toString(36).substring(2, 8);
  const email = `fb_${randomStr}@${domain}`;
  res.json({ email });
});

// 2. Main API endpoint to get Facebook OTP for any given email
app.post('/api/get-fb-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email parameter is required' });
  }

  console.log(`[API Request] Checking Facebook OTP for: ${email}`);
  try {
    const result = await waitForFacebookOtp(email, 120000); // 2 minute timeout
    res.json({ 
      success: true, 
      email: email,
      otp: result.otp, 
      confirmUrl: result.confirmUrl,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 Facebook OTP API Server Running:`);
  console.log(`👉 Local: http://localhost:${PORT}`);
  console.log(`👉 API Endpoint: POST http://localhost:${PORT}/api/get-fb-otp`);
  console.log(`===============================================`);
});
