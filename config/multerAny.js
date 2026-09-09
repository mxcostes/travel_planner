const multer = require('multer');

// Used only for the inbound-email webhook. Mailgun's payload can include
// non-PDF parts (inline images, etc.) alongside the attachment we care
// about - filtering here would abort the whole parse, so accept everything
// and let the webhook handler pick out the PDF itself.
const uploadAny = multer({ storage: multer.memoryStorage() });

module.exports = uploadAny;
