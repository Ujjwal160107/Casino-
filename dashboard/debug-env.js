const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Error loading .env:', result.error);
}

const dbUrl = process.env.DATABASE_URL || 'NOT_FOUND';
fs.writeFileSync('db_url.txt', dbUrl);
console.log('Wrote DATABASE_URL to db_url.txt');
