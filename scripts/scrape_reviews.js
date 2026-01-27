const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const OUTPUT_FILE = path.join(__dirname, '../reviews.json');
const TARGET_URL = process.argv[2];

// Simple sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Random delay
const randomDelay = (min = 1000, max = 3000) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
};

// --- MAIN FUNCTION ---
(async () => {
    if (!TARGET_URL) {
        console.error('❌ Usage: node scripts/scrape_reviews.js <TOP_GG_URL>');
        process.exit(1);
    }

    console.log(`🔍 Target URL: ${TARGET_URL}`);
    console.log('⚠️  DISCLAIMER: Scraping functionality may change if Top.gg updates their UI. Use responsibly.');

    let browser;
    try {
        console.log('🚀 Launching browser...');
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        console.log('🌐 Navigating to page...');
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('📜 Scrolling to load all reviews...');

        let previousHeight = 0;
        let noChangeCount = 0;

        // Scroll limit to prevent infinite loops if something breaks
        let scrollAttempts = 0;
        const MAX_SCROLLS = 20;

        while (noChangeCount < 3 && scrollAttempts < MAX_SCROLLS) {
            const scrollHeight = await page.evaluate('document.body.scrollHeight');
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await sleep(randomDelay(2000, 3000));
            const newHeight = await page.evaluate('document.body.scrollHeight');

            if (newHeight === previousHeight) {
                noChangeCount++;
            } else {
                noChangeCount = 0;
                previousHeight = newHeight;
                console.log('   ...loaded more content');
            }
            scrollAttempts++;
        }

        console.log('⛏️  Extracting review data...');

        const reviews = await page.evaluate(() => {
            const data = [];

            // Helper to get text safely
            const getText = (el) => el ? el.innerText.trim() : '';
            const getAttr = (el, attr) => el ? el.getAttribute(attr) : '';

            // STRATEGY: Find reviews via Star Ratings (aria-label="5 stars", etc)
            // This is more robust than class names which change often.
            const starElements = Array.from(document.querySelectorAll('[aria-label$="stars"], [aria-label$="star"]'));

            const processedTexts = new Set();

            starElements.forEach(star => {
                try {
                    // Traverse up to find the review card container
                    let card = null;
                    let current = star.parentElement;

                    // Go up max 6 levels to find a container with substantial text
                    for (let i = 0; i < 6; i++) {
                        if (!current) break;
                        const text = current.innerText;
                        // A review card should typically have > 30 chars (username + content)
                        // But not be the whole page (> 5000 chars)
                        if (text.length > 30 && text.length < 3000) {
                            card = current;
                            // Don't break immediately, sometimes the first match is just a wrapper around the stars
                            // We prefer the largest container that is still "card-sized"
                        }
                        current = current.parentElement;
                    }

                    if (!card) return;

                    // Avoid processing the same card twice
                    // We use the full text as a signature
                    const fullText = getText(card);
                    if (processedTexts.has(fullText)) return;
                    processedTexts.add(fullText);

                    // PARSING LOGIC
                    // We assume the text structure roughly maps to:
                    // 1. Username
                    // 2. Metadata (Date/Posted info)
                    // 3. Review Content

                    const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);

                    if (lines.length < 2) return;

                    // 1. Rating
                    const label = getAttr(star, 'aria-label') || '';
                    const ratingMatch = label.match(/(\d)/);
                    const rating = ratingMatch ? parseInt(ratingMatch[1]) : 5;

                    // 2. Username (Usually the first line)
                    let username = lines[0];

                    // 3. Date 
                    // Look for lines containing "ago", "Posted", or typical date formats
                    let date = new Date().toISOString();
                    let dateLineIndex = -1;

                    for (let i = 0; i < Math.min(lines.length, 5); i++) {
                        const lineResponse = lines[i].toLowerCase();
                        if (lineResponse.includes('ago') || lineResponse.includes('posted') || lineResponse.match(/\d{4}/)) {
                            date = lines[i];
                            dateLineIndex = i;
                            break;
                        }
                    }

                    // 4. Content
                    // If we found a date line, content is everything after it.
                    // If not, assume content starts after username (index 1).
                    const startIndex = dateLineIndex !== -1 ? dateLineIndex + 1 : 1;
                    const content = lines.slice(startIndex).join(' ');

                    // Filter out non-reviews or empty content
                    if (content.length < 3) return;
                    if (username.length > 50) return; // Probably not a username

                    data.push({
                        username,
                        rating,
                        review: content,
                        date
                    });

                } catch (e) {
                    // ignore errors for individual cards
                }
            });

            return data;
        });

        // Debug: Save HTML if still zero
        if (reviews.length === 0) {
            console.log('⚠️  No reviews found. Saving debug_page.html...');
            fs.writeFileSync(path.join(__dirname, 'debug_page.html'), await page.content());
        }

        console.log(`🧹 Cleaning ${reviews.length} extracted items...`);
        // Simple dedup based on username
        const uniqueReviews = [];
        const seenUsers = new Set();

        reviews.forEach(r => {
            if (!seenUsers.has(r.username + r.review.substring(0, 20))) {
                seenUsers.add(r.username + r.review.substring(0, 20));
                uniqueReviews.push(r);
            }
        });

        if (uniqueReviews.length > 0) {
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueReviews, null, 2));
            console.log(`🎉 Success! Saved ${uniqueReviews.length} reviews to ${OUTPUT_FILE}`);
            console.log(`   (First review: ${uniqueReviews[0].username}: "${uniqueReviews[0].review.substring(0, 30)}...")`);
        } else {
            console.warn('⚠️  No reviews found even with robust selectors.');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (browser) await browser.close();
    }
})();
