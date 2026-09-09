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

module.exports = { insertBookingFromFields };
