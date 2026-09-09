const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const s3 = require('../config/r2');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const uploadAny = require('../config/multerAny');
const { extractBookingFromPdf } = require('../controllers/bookingExtraction');
const { insertBookingFromFields } = require('../controllers/bookingSave');

function verifyMailgunSignature(body) {
    const signingKey = process.env.MAILGUN_SIGNING_KEY;
    const { timestamp, token, signature } = body;
    if (!signingKey || !timestamp || !token || !signature) return false;

    const expected = crypto.createHmac('sha256', signingKey).update(timestamp + token).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const givenBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== givenBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

// Mailgun posts parsed inbound emails here.
router.post('/webhooks/inbound-email', uploadAny.any(), async (req, res) => {
    try {
        if (!verifyMailgunSignature(req.body)) {
            console.error("❌ Inbound email webhook: signature verification failed");
            return res.status(403).send('Invalid signature');
        }

        const recipient = req.body.recipient || '';
        const token = recipient.split('@')[0];
        const [users] = await db.query('SELECT user_id FROM users WHERE forwarding_token = ?', [token]);
        if (users.length === 0) {
            console.warn("⚠️ Inbound email: no user for forwarding token", token);
            return res.status(200).send('No matching user');
        }
        const userId = users[0].user_id;

        const pdfFile = (req.files || []).find((f) => f.mimetype === 'application/pdf');
        if (!pdfFile) {
            console.warn("⚠️ Inbound email: no PDF attachment from", recipient);
            return res.status(200).send('No PDF attachment');
        }

        const extracted = await extractBookingFromPdf(pdfFile.buffer);

        const key = Date.now() + '-' + pdfFile.originalname;
        await s3.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key,
            Body: pdfFile.buffer,
            ContentType: 'application/pdf'
        }));

        await db.query(
            "INSERT INTO pending_imports (user_id, sender_email, original_name, file_name, extracted_data) VALUES (?, ?, ?, ?, ?)",
            [userId, req.body.sender || req.body.from || null, pdfFile.originalname, key, JSON.stringify(extracted)]
        );

        res.status(200).send('OK');
    } catch (err) {
        console.error("❌ Failed to process inbound email:", err);
        // Ack anyway - Mailgun retries on non-2xx, and a bad document isn't worth retrying.
        res.status(200).send('Error handled');
    }
});

// Shows the user's forwarding address and any pending imports waiting for review.
router.get('/email-import', async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.redirect('/auth/login');
    }
    const userId = req.session.user.id;

    try {
        const [[user]] = await db.query('SELECT forwarding_token FROM users WHERE user_id = ?', [userId]);
        let forwardingToken = user.forwarding_token;
        if (!forwardingToken) {
            forwardingToken = crypto.randomBytes(9).toString('base64url');
            await db.query('UPDATE users SET forwarding_token = ? WHERE user_id = ?', [forwardingToken, userId]);
        }

        const [pending] = await db.query(
            "SELECT * FROM pending_imports WHERE user_id = ? AND status = 'pending' ORDER BY received_at DESC",
            [userId]
        );

        res.render('pages/email_import', {
            user: req.session.user,
            forwardingToken,
            importDomain: process.env.EMAIL_IMPORT_DOMAIN || 'import.yourdomain.com',
            pending
        });
    } catch (err) {
        console.error("❌ Failed to load email import page:", err);
        res.status(500).send("❌ Failed to load page.");
    }
});

// Review one pending import: same fields as the normal booking review, plus
// a trip picker since a forwarded email doesn't say which trip it's for.
router.get('/email-import/:import_id/review', async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.redirect('/auth/login');
    }
    const userId = req.session.user.id;
    const { import_id } = req.params;

    try {
        const [imports] = await db.query(
            "SELECT * FROM pending_imports WHERE import_id = ? AND user_id = ? AND status = 'pending'",
            [import_id, userId]
        );
        if (imports.length === 0) {
            return res.status(404).send("Import not found.");
        }
        const pendingImport = imports[0];
        const extracted = pendingImport.extracted_data || {};

        const [trips] = await db.query(
            `SELECT t.trip_id, t.trip_name FROM trips t
             JOIN trip_users s ON t.trip_id = s.trip_id
             WHERE s.user_id = ? ORDER BY t.start_date ASC`,
            [userId]
        );

        res.render('pages/email_import_review', {
            pendingImport,
            booking: extracted.booking || {},
            extractedData: JSON.stringify(extracted),
            trips,
            apiKey: process.env.GOOGLE_API_KEY
        });
    } catch (err) {
        console.error("❌ Failed to load import review:", err);
        res.status(500).send("❌ Failed to load import.");
    }
});

// Confirm: attach to an existing trip or create a new one, then save the
// booking exactly like the normal flow (including the extras-review step).
router.post('/email-import/:import_id/confirm', async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.redirect('/auth/login');
    }
    const userId = req.session.user.id;
    const { import_id } = req.params;
    const { trip_choice, new_trip_name, new_trip_start_date, new_trip_end_date, new_trip_start_location, new_trip_end_location } = req.body;

    try {
        const [imports] = await db.query(
            "SELECT * FROM pending_imports WHERE import_id = ? AND user_id = ? AND status = 'pending'",
            [import_id, userId]
        );
        if (imports.length === 0) {
            return res.status(404).send("Import not found.");
        }

        let tripId = trip_choice;
        if (trip_choice === 'new') {
            const [result] = await db.query(
                "INSERT INTO trips (user_id, trip_name, start_date, end_date, start_location, end_location) VALUES (?, ?, ?, ?, ?, ?)",
                [userId, new_trip_name, new_trip_start_date || null, new_trip_end_date || null, new_trip_start_location, new_trip_end_location]
            );
            tripId = result.insertId;
            await db.query("INSERT INTO trip_users (trip_id, user_id, role) VALUES (?, ?, 'owner')", [tripId, userId]);
        } else {
            const [access] = await db.query(
                "SELECT 1 FROM trip_users WHERE trip_id = ? AND user_id = ?",
                [tripId, userId]
            );
            if (access.length === 0) {
                return res.status(403).send("Access denied: not your trip.");
            }
        }

        const { bookingId, hasExtras } = await insertBookingFromFields(tripId, req.body);
        await db.query("UPDATE pending_imports SET status = 'reviewed' WHERE import_id = ?", [import_id]);

        if (hasExtras) {
            res.redirect(`/trips/${tripId}/bookings/${bookingId}/review-extras`);
        } else {
            res.redirect(`/trips/${tripId}/bookings`);
        }
    } catch (err) {
        console.error("❌ Failed to confirm import:", err);
        res.status(500).send("❌ Failed to save this import.");
    }
});

// Discard a pending import without creating anything from it.
router.post('/email-import/:import_id/discard', async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.redirect('/auth/login');
    }
    const userId = req.session.user.id;
    const { import_id } = req.params;

    try {
        await db.query(
            "UPDATE pending_imports SET status = 'discarded' WHERE import_id = ? AND user_id = ?",
            [import_id, userId]
        );
        res.redirect('/email-import');
    } catch (err) {
        console.error("❌ Failed to discard import:", err);
        res.status(500).send("❌ Failed to discard.");
    }
});

module.exports = router;
