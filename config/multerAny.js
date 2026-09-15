const multer = require('multer');

// Used only for the inbound-email webhook. Mailgun's payload can include
// non-PDF parts (inline images, etc.) alongside the attachment we care
// about - filtering here would abort the whole parse, so accept everything
// and let the webhook handler pick out the PDF itself.
// busboy's default fieldSize (1MB) is easily exceeded by Mailgun's
// body-html/message-headers text fields on a thread with a lot of quoted
// history or inline signature images, so raise it well past that.
const uploadAny = multer({
    storage: multer.memoryStorage(),
    limits: { fieldSize: 10 * 1024 * 1024 }
});

module.exports = uploadAny;
