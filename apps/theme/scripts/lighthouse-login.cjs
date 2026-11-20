/**
 * Gets Lighthouse past the dev store's password page and into the theme under
 * test (SHO-174). LHCI runs this once, in the browser it then audits with, so
 * the cookies it leaves are the ones Lighthouse's page loads send.
 *
 * Reads the password from SHOP_PASSWORD at run time. Shopify's action pasted
 * it into a generated script; this never writes it anywhere.
 *
 * ⚠️ The password step used to time out now and then (#65, #96). So: three
 * tries, a longer wait each time, and a message that says which step failed.
 */
const ATTEMPTS = 3;

const { SHOP_STORE, SHOP_PASSWORD, THEME_ID } = process.env;

const login = async (page, origin) => {
  await page.goto(`${origin}/password`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const field = 'form[action*="password"] input[type="password"]';
  await page.waitForSelector(field, { timeout: 15_000 });
  await page.type(field, SHOP_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }),
    page.$eval('form[action*="password"]', (form) => form.submit()),
  ]);
  if (new URL(page.url()).pathname === "/password") {
    throw new Error("still on /password after submitting: is SHOP_PASSWORD right?");
  }
};

module.exports = async (browser) => {
  if (!SHOP_STORE || !SHOP_PASSWORD || !THEME_ID) {
    throw new Error(
      "lighthouse-login: SHOP_STORE, SHOP_PASSWORD and THEME_ID must be set",
    );
  }
  const origin = `https://${SHOP_STORE.replace(/^https?:\/\//, "")}`;
  const page = await browser.newPage();
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await login(page, origin);
        break;
      } catch (error) {
        if (attempt === ATTEMPTS) {
          throw new Error(
            `lighthouse-login: the storefront password step failed ${ATTEMPTS} times: ${error.message}`,
          );
        }
        console.error(
          `lighthouse-login: password step failed (${error.message}); retrying`,
        );
        await new Promise((resolve) => setTimeout(resolve, 5_000 * attempt));
      }
    }
    // The preview cookie, so every audited page renders the theme under test
    // without its own `preview_theme_id` (which Shopify answers with a
    // redirect, adding a round trip to every measurement). `pb=0`: no
    // preview bar on the audited pages.
    await page.goto(`${origin}/?preview_theme_id=${THEME_ID}&_fd=0&pb=0`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    // Checked, because if it silently didn't take, every audit would measure
    // the published theme and pass or fail for the wrong reasons.
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const shown = await page.evaluate(() => window.Shopify?.theme?.id);
    if (String(shown) !== String(THEME_ID)) {
      throw new Error(
        `lighthouse-login: the store shows theme ${shown}, not ${THEME_ID}: the preview cookie didn't take`,
      );
    }
  } finally {
    await page.close();
  }
};
