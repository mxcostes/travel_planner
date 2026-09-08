require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Missing required environment variable: ANTHROPIC_API_KEY (booking PDF extraction needs this set)');
}

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

module.exports = anthropic;
