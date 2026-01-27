const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    // Load local file
    const filePath = path.join(__dirname, 'debug_page.html');
    await page.goto(`file://${filePath}`, { waitUntil: 'domcontentloaded' });

    console.log('📄 Loaded debug_page.html');

    // Analyze specific potential elements
    const findings = await page.evaluate(() => {
        const results = {};

        // 1. Check for specific classes
        const classes = {};
        document.querySelectorAll('div').forEach(div => {
            if (div.className && typeof div.className === 'string') {
                div.className.split(' ').forEach(c => {
                    if (c.toLowerCase().includes('review') || c.toLowerCase().includes('card')) {
                        classes[c] = (classes[c] || 0) + 1;
                    }
                });
            }
        });
        results.potentialClasses = classes;

        // 2. Check for stars (aria-label)
        const stars = Array.from(document.querySelectorAll('[aria-label*="star"], [aria-label*="Star"]'));
        results.starElements = stars.length;
        if (stars.length > 0) {
            results.starExample = stars[0].outerHTML;
            results.starParentClass = stars[0].parentElement ? stars[0].parentElement.className : 'none';
        }

        // 3. Look for "Posted" text
        const postedEls = Array.from(document.querySelectorAll('*')).filter(el => el.children.length === 0 && el.innerText.includes('Posted'));
        results.postedCount = postedEls.length;
        if (postedEls.length > 0) {
            results.postedExample = postedEls[0].outerHTML;
            results.postedParent = postedEls[0].parentElement.outerHTML;
        }

        return results;
    });

    console.log('🔍 Findings:');
    console.log(JSON.stringify(findings, null, 2));

    await browser.close();
})();
