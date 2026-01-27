const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'debug_page.html');
const content = fs.readFileSync(filePath, 'utf8');

console.log('📄 Analyzed bytes:', content.length);

// Extract all class names
const classRegex = /class="([^"]*)"/g;
let match;
const classCounts = {};

while ((match = classRegex.exec(content)) !== null) {
    const classes = match[1].split(' ');
    classes.forEach(c => {
        if (c.trim()) {
            classCounts[c] = (classCounts[c] || 0) + 1;
        }
    });
}

// Filter for interesting classes
const interesting = Object.entries(classCounts)
    .filter(([c, count]) => c.toLowerCase().includes('card') || c.toLowerCase().includes('review') || c.toLowerCase().includes('container'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

console.log('🏆 Top "Card/Review" Classes:', interesting);

// Check for stars
const starRegex = /aria-label="([^"]*)"/g;
const ariaCounts = {};
while ((match = starRegex.exec(content)) !== null) {
    const label = match[1];
    if (label.toLowerCase().includes('star')) {
        ariaCounts[label] = (ariaCounts[label] || 0) + 1;
    }
}
console.log('⭐ Star Labels:', ariaCounts);

// Check for posted time
if (content.includes('<time')) {
    console.log('⏰ Found <time> tags.');
} else {
    console.log('❌ No <time> tags found.');
}
