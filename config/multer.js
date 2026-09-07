const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = require('./r2');

// Storage config: booking PDFs go straight to the R2 bucket
const storage = multerS3({
    s3,
    bucket: process.env.R2_BUCKET,
    key: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

// File filter: Allow only PDFs
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed!'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

module.exports = upload;
