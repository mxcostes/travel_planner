const multer = require('multer');

// Used only for the AI-extraction upload path, which needs the raw PDF
// bytes in memory to send to Claude before the file is written to R2.
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed!'), false);
    }
};

const uploadMemory = multer({ storage: multer.memoryStorage(), fileFilter: fileFilter });

module.exports = uploadMemory;
