const db = require('../config/db');

// Shared by the normal "scan a booking's PDF" flow and the email-import flow:
// insert a reviewed/confirmed booking, and report whether its extracted_data
// has itinerary/expense items worth offering the user next.
async function insertBookingFromFields(tripId, fields) {
    let { accommodation_type, vendor_name, start_date, end_date, location, start_location, end_location, booking_link, file_name, original_name, extracted_data } = fields;

    if (!end_date || end_date.trim() === '') {
        end_date = null;
    }

    const sql = `
        INSERT INTO bookings
        (trip_id, accommodation_type, vendor_name, start_date, end_date, location, start_location, end_location, booking_link, file_name, original_name, extracted_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await db.query(sql, [tripId, accommodation_type, vendor_name, start_date, end_date, location, start_location, end_location, booking_link, file_name || null, original_name || null, extracted_data || null]);

    let parsed = null;
    try {
        parsed = extracted_data ? JSON.parse(extracted_data) : null;
    } catch (parseErr) {
        parsed = null;
    }
    const hasExtras = !!(parsed && ((parsed.itinerary_segments && parsed.itinerary_segments.length) || (parsed.expense_items && parsed.expense_items.length)));

    return { bookingId: result.insertId, hasExtras };
}

// Shared by the booking-extras review and the pasted-itinerary-plan review:
// save whichever extracted itinerary/expense items the user checked off.
async function insertSelectedExtras(tripId, body) {
    const itinerary = Object.values(body.itinerary || {});
    const expenses = Object.values(body.expenses || {});

    for (const item of itinerary) {
        if (!item.include) continue;
        await db.query(
            "INSERT INTO itinerary (trip_id, activity_type, activity_name, activity_date, start_time, location, details) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [tripId, item.activity_type, item.activity_name, item.activity_date, item.start_time || null, item.location || null, item.details || null]
        );
    }

    for (const item of expenses) {
        if (!item.include) continue;
        await db.query(
            "INSERT INTO expenses (trip_id, category, amount, description, expense_date) VALUES (?, ?, ?, ?, ?)",
            [tripId, item.category, parseFloat(item.amount) || 0, item.description || null, item.expense_date || null]
        );
    }
}

module.exports = { insertBookingFromFields, insertSelectedExtras };
