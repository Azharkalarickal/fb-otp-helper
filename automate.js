require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { waitForMagicLink } = require('./email_fetcher');

async function run() {
  const domain = process.env.DOMAIN || (process.env.HOSTINGER_EMAIL ? process.env.HOSTINGER_EMAIL.split('@')[1] : null);

  if (!domain) {
    console.error('[ERROR] ദയവായി .env ഫയലിൽ DOMAIN നൽകുക (ഉദാ: DOMAIN=yourdomain.com)');
    process.exit(1);
  }

  // 1. Generate a random email address
  const randomStr = Math.random().toString(36).substring(2, 9);
  const targetEmail = `mage_${randomStr}@${domain}`;

  console.log('====================================================');
  console.log(`[START] Mage.space ഓട്ടോമേഷൻ ആരംഭിക്കുന്നു...`);
  console.log(`[EMAIL] ഉപയോഗിക്കുന്ന ഇമെയിൽ: ${targetEmail}`);
  console.log('====================================================');

  const isHeadless = process.env.HEADLESS === 'true';
  const browser = await chromium.launch({
    headless: isHeadless,
    channel: 'chrome', // നിങ്ങളുടെ ഒറിജിനൽ Google Chrome തന്നെ ഓപ്പൺ ചെയ്യുന്നു
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: null // ഫുൾ സ്ക്രീൻ സൈസിൽ തന്നെ ബ്രൗസർ ഓപ്പൺ ചെയ്യാൻ
  });

  const page = await context.newPage();

  try {
    console.log('[BROWSER] Mage.space തുറക്കുന്നു...');
    await page.goto('https://www.mage.space/explore', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // If modal is not open, click the Login button
    const emailInput = page.locator('input[placeholder="me@email.com"]');
    if (!(await emailInput.isVisible())) {
      console.log('[BROWSER] Login ബട്ടൺ ക്ലിക്ക് ചെയ്യുന്നു...');
      const loginBtn = page.locator('a:has-text("Login"), button:has-text("Login")').first();
      if (await loginBtn.isVisible()) {
        await loginBtn.click();
        await page.waitForTimeout(1500);
      }
    }

    // Wait for the email input field
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    console.log(`[BROWSER] ഇമെയിൽ ടൈപ്പ് ചെയ്യുന്നു: ${targetEmail}`);
    await emailInput.fill(targetEmail);

    // Make sure terms checkbox is checked
    const checkbox = page.locator('input[type="checkbox"]');
    if (await checkbox.isVisible()) {
      const isChecked = await checkbox.isChecked();
      if (!isChecked) {
        console.log('[BROWSER] Terms and Conditions ചെക്ക് ചെയ്യുന്നു...');
        await checkbox.check();
      }
    }

    // Save email to localStorage under Firebase & Mage keys
    await page.evaluate(email => {
      localStorage.setItem('emailForSignIn', email);
      localStorage.setItem('__login_email', email);
      localStorage.setItem('firebase:emailForSignIn', email);
    }, targetEmail);

    // Click the submit arrow button
    const submitBtn = page.locator('div[data-position="right"] button').first();
    console.log('[BROWSER] "Send Link" ബട്ടൺ ക്ലിക്ക് ചെയ്യുന്നു...');
    await submitBtn.click();

    console.log('[WAIT] ലോഗിൻ ലിങ്ക് ഇമെയിലിലേക്ക് അയച്ചിട്ടുണ്ട്. മെയിലിനായി കാത്തിരിക്കുന്നു...');

    // 2. Fetch the magic link from Hostinger mailbox
    const magicLink = await waitForMagicLink(targetEmail);
    console.log(`\n[SUCCESS] ലോഗിൻ ലിങ്ക് ലഭിച്ചു: ${magicLink}`);

    // 3. Open the magic link in the SAME browser session
    console.log('[BROWSER] ലോഗിൻ ലിങ്ക് അതേ ബ്രൗസർ ടാബിൽ തുറക്കുന്നു...');
    try {
      await page.goto(magicLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      console.log('[BROWSER] നാവിഗേഷൻ തുടരുന്നു...');
    }

    // Check if "Finish Signing In" modal appeared (wait up to 8s)
    const finishHeading = page.locator('text=Finish Signing In');
    const hasFinishDialog = await finishHeading.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
    
    if (hasFinishDialog) {
      console.log('[BROWSER] "Finish Signing In" കൺഫർമേഷൻ കാണുന്നു, ഇമെയിൽ നൽകുന്നു...');
      const confirmEmailInput = page.locator('input[type="email"], input[placeholder="me@email.com"]').first();
      await confirmEmailInput.fill(targetEmail);
      const signInBtn = page.locator('button:has-text("Sign in")').first();
      await signInBtn.click();
      console.log('[BROWSER] "Sign in" ക്ലിക്ക് ചെയ്തു.');
    }

    console.log('[BROWSER] ലോഗിൻ പൂർത്തിയാകാൻ കാത്തിരിക്കുന്നു...');
    // Wait for the LOGIN button to disappear or 300 Gems to appear
    await page.locator('text=LOGIN, text=Login').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4000);

    // If onboarding=1 is still in URL after login, go to clean /explore to show the prompt box
    if (page.url().includes('onboarding=1')) {
      console.log('[BROWSER] ഇമേജ് പ്രോംപ്റ്റ് ബോക്സിലേക്ക് മാറുന്നു...');
      await page.goto('https://www.mage.space/explore', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
    }

    // Press Escape to dismiss any modal overlay
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Open prompt bar if minimized
    const createBtn = page.locator('button:has-text("Create"), a:has-text("Create"), span:has-text("Create")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click().catch(() => {});
    }

    console.log('[BROWSER] ലോഗിൻ അവസ്ഥ പരിശോധിക്കുന്നു...');
    const pageTitle = await page.title();
    console.log(`[INFO] നിലവിലെ പേജ്: "${pageTitle}"`);

    // 4. Save session/cookies for future use
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }

    const sessionFilePath = path.join(sessionsDir, `${targetEmail.replace(/[@.]/g, '_')}.json`);
    await context.storageState({ path: sessionFilePath });

    console.log('====================================================');
    console.log(`🎉 [COMPLETED] ലോഗിൻ വിജയകരമായി പൂർത്തിയായി!`);
    console.log(`📁 അക്കൗണ്ട് സെഷൻ ഫയൽ സൂക്ഷിച്ചിരിക്കുന്നു: ${sessionFilePath}`);
    console.log('====================================================');

    // Keep browser open indefinitely for user to use
    if (!isHeadless) {
      console.log('\n✨ ബ്രൗസർ ഓപ്പൺ ആണ്! നിങ്ങൾക്ക് ഇപ്പോൾ Mage.space ഉപയോഗിക്കാം.');
      console.log('👉 ഉപയോഗം കഴിഞ്ഞാൽ വിൻഡോ നേരിട്ട് ക്ലോസ് ചെയ്യാം (അല്ലെങ്കിൽ ടെർമിനലിൽ ENTER അടിക്കുക)...');

      await new Promise(resolve => {
        browser.on('disconnected', resolve);
        process.stdin.resume();
        process.stdin.once('data', resolve);
      });
    }
  } catch (err) {
    console.error('\n[ERROR] ഓട്ടോമേഷനിൽ പ്രശ്നം സംഭവിച്ചു:', err.message);
  } finally {
    if (browser && browser.isConnected()) {
      await browser.close().catch(() => {});
    }
    process.exit(0);
  }
}

run();
