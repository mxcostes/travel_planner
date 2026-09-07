require('dotenv').config();
const { S3Client } = require('@aws-sdk/client-s3');

['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].forEach((name) => {
    if (!process.env[name]) {
        throw new Error(`Missing required environment variable: ${name} (booking file uploads need this set)`);
    }
});

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    forcePathStyle: true,
    // R2 rejects the checksum header the AWS SDK v3 attaches by default
    // (surfaces as a generic "Access Denied", not a checksum error).
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
});

module.exports = s3;
