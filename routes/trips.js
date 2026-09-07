const express = require('express');
const router = express.Router();
const db = require('../config/db');
const upload = require('../config/multer');
const path = require('path');
const axios = require('axios');
const checkTripAccess = require('../middleware/tripAccess'); // Import middleware
require('dotenv').config();

// Example route to verify it's working
router.get('/', (req, res) => {
    res.send("Trips route is working!");
});

//Trip Add/Create page and funtion
router.get('/trip_add', (req, res) => {
    res.render('pages/trip_add', {
        user: req.session.user || { username: "Guest" },
        apiKey: process.env.GOOGLE_API_KEY  // Pass API key to EJS
    });
});

// Handle Trip Creation
router.post('/create', async (req, res) => {
    const { trip_name, start_date, end_date, start_location, end_location } = req.body;

    // Check if user is logged in
    if (!req.session.user || !req.session.user.id) {
        console.error("❌ User session not found");
        return res.status(401).send("Unauthorized: Please log in to create a trip.");
    }

    const userId = req.session.user.id;  // Safe to access now

    // Ensure required fields are present
    if (!trip_name || !start_location || !end_location) {
        console.error("❌ Missing required fields:", req.body);
        return res.status(400).send("All fields are required.");
    }

    const sql = "INSERT INTO trips (user_id, trip_name, start_date, end_date, start_location, end_location) VALUES (?, ?, ?, ?, ?, ?)";

    try {
        const [result] = await db.query(sql, [userId, trip_name, start_date, end_date, start_location, end_location]);
        console.log("✅ Trip created successfully:", result);
        const newTripId = result.insertId;

        // Register the creator as owner so the trip shows up on their dashboard
        // and owner-gated routes (edit/share/delete/budget) work for them.
        await db.query(
            "INSERT INTO trip_users (trip_id, user_id, role) VALUES (?, ?, 'owner')",
            [newTripId, userId]
        );

        res.redirect(`/trips/${newTripId}`);
    } catch (err) {
        console.error("❌ MySQL Error:", err);
        res.status(500).send("Database error. Please try again.");
    }
});

// Edit Trip Page and Function
router.get('/:trip_id/edit', checkTripAccess("editor"), async (req, res) => {
    const { trip_id } = req.params;
    const tripSql = "SELECT * FROM trips WHERE trip_id = ?";

    try {
        const [tripResult] = await db.query(tripSql, [trip_id]);
        if (tripResult.length === 0) {
            return res.status(404).send("Trip not found.");
        }

        const trip = tripResult[0];

        res.render('pages/edit_trip', {
            user: req.session.user || { username: "Guest" },
            trip,
            apiKey: process.env.GOOGLE_API_KEY
        });
    } catch (err) {
        console.error("❌ Trip not found:", err);
        res.status(404).send("Trip not found.");
    }
});

// Handle Trip Update
router.post('/:trip_id/edit', checkTripAccess("editor"), async (req, res) => {
    const { trip_id } = req.params;
    const { trip_name, start_location, end_location, start_date, end_date } = req.body;

    console.log("🔍 Debug - Received Data:", req.body);

    const sql = `
        UPDATE trips
        SET trip_name = ?, start_location = ?, end_location = ?, start_date = ?, end_date = ?
        WHERE trip_id = ?
    `;

    try {
        await db.query(sql, [trip_name, start_location, end_location, start_date, end_date, trip_id]);
        console.log("✅ Trip updated successfully");
        res.redirect(`/trips/${trip_id}/`);
    } catch (err) {
        console.error("❌ Failed to update trip:", err);
        res.status(500).send("❌ Failed to update trip.");
    }
});

// Share Trip
router.post('/:trip_id/share', checkTripAccess("owner"), async (req, res) => {
    const { trip_id } = req.params;
    const { user_email, role } = req.body;

    const getUserSql = "SELECT user_id FROM users WHERE email = ?";
    const insertShareSql = "INSERT INTO trip_users (trip_id, user_id, role) VALUES (?, ?, ?)";

    try {
        const [userResult] = await db.query(getUserSql, [user_email]);
        if (userResult.length === 0) {
            return res.status(404).send("User not found.");
        }
        const user_id = userResult[0].user_id;

        await db.query(insertShareSql, [trip_id, user_id, role]);
        res.redirect(`/trips/${trip_id}`);
    } catch (err) {
        console.error("❌ Failed to share trip:", err);
        res.status(500).send("Failed to share trip.");
    }
});

//update user permissions
router.post('/:trip_id/share/update', checkTripAccess("owner"), async (req, res) => {
    const { trip_id } = req.params;
    const { user_id, role } = req.body;

    const updateRoleSql = "UPDATE trip_users SET role = ? WHERE trip_id = ? AND user_id = ?";

    try {
        await db.query(updateRoleSql, [role, trip_id, user_id]);
        res.redirect(`/trips/${trip_id}/manage-sharing`);
    } catch (err) {
        console.error("❌ Failed to update role:", err);
        res.status(500).send("Failed to update role.");
    }
});

//remove user permissions
router.post('/:trip_id/share/remove', checkTripAccess("owner"), async (req, res) => {
    const { trip_id } = req.params;
    const { user_id } = req.body;

    const deleteUserSql = "DELETE FROM trip_users WHERE trip_id = ? AND user_id = ?";

    try {
        await db.query(deleteUserSql, [trip_id, user_id]);
        res.redirect(`/trips/${trip_id}/manage-sharing`);
    } catch (err) {
        console.error("❌ Failed to remove user:", err);
        res.status(500).send("Failed to remove user.");
    }
});

// Route to Delete Trip
router.post('/:trip_id/delete', checkTripAccess("owner"), async (req, res) => {
    const { trip_id } = req.params;

    const deleteTripSql = "DELETE FROM trips WHERE trip_id = ?";

    try {
        await db.query(deleteTripSql, [trip_id]);
        res.redirect('/dashboard');
    } catch (err) {
        console.error("❌ Failed to delete trip:", err);
        res.status(500).send("Failed to delete trip.");
    }
});

//Render budget page
router.get('/:trip_id/budget', checkTripAccess("viewer"), async (req, res) => {
    const { trip_id } = req.params;

    const sqlTrip = "SELECT * FROM trips WHERE trip_id = ?";
    const sqlExpenses = "SELECT * FROM expenses WHERE trip_id = ? ORDER BY expense_date DESC";

    try {
        const [tripResult] = await db.query(sqlTrip, [trip_id]);
        if (tripResult.length === 0) {
            console.warn("⚠️ Trip not found for ID:", trip_id);
            return res.status(404).send("Trip not found.");
        }

        const trip = tripResult[0];

        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        const [expenses] = await db.query(sqlExpenses, [trip_id]);

        const summary = { byCategory: {}, byDate: {} };
        expenses.forEach(expense => {
            expense.formattedDate = new Date(expense.expense_date).toLocaleDateString('en-US', options);

            const expenseAmount = parseFloat(expense.amount) || 0.00;

            summary.byCategory[expense.category] =
                (summary.byCategory[expense.category] || 0) + expenseAmount;

            summary.byDate[expense.formattedDate] =
                (summary.byDate[expense.formattedDate] || 0) + expenseAmount;
        });

        res.render('pages/budget', {
            user: req.session.user || { username: "Guest" },
            trip,
            expenses,
            expenseSummary: summary,
            apiKey: process.env.GOOGLE_API_KEY,
            edit: req.query.edit // ✅ Pass edit param to the template
        });
    } catch (err) {
        console.error("❌ Database Error:", err);
        res.status(500).send("❌ Failed to fetch trip details.");
    }
});


// ✍️ Route to Add a New Expense
router.post('/:trip_id/budget/add', async (req, res) => {
    const { trip_id } = req.params;
    const { category, amount, description, expense_date } = req.body;

    if (!category || !amount || !expense_date) {
        return res.status(400).send("❌ Missing required fields.");
    }

    const sqlInsert = `
        INSERT INTO expenses (trip_id, category, amount, description, expense_date)
        VALUES (?, ?, ?, ?, ?)
    `;

    try {
        await db.query(sqlInsert, [trip_id, category, parseFloat(amount), description, expense_date]);
        console.log("Expense added successfully");
        res.redirect(`/trips/${trip_id}/budget`);
    } catch (err) {
        console.error("❌ Error inserting expense:", err);
        res.status(500).send("❌ Failed to add expense.");
    }
});

router.post('/:trip_id/budget/delete/:expense_id', async (req, res) => {
    const { trip_id, expense_id } = req.params;

    const sql = "DELETE FROM expenses WHERE expense_id = ? AND trip_id = ?";

    try {
        await db.query(sql, [expense_id, trip_id]);
        res.redirect(`/trips/${trip_id}/budget`);
    } catch (err) {
        console.error("❌ Failed to delete expense:", err);
        res.status(500).send("Error deleting expense.");
    }
});

router.post('/:trip_id/budget/update/:expense_id', async (req, res) => {
    const { trip_id, expense_id } = req.params;
    const { category, description, amount, expense_date } = req.body;

    const sql = `
        UPDATE expenses
        SET category = ?, description = ?, amount = ?, expense_date = ?
        WHERE expense_id = ? AND trip_id = ?
    `;

    try {
        await db.query(sql, [category, description, parseFloat(amount), expense_date, expense_id, trip_id]);
        res.redirect(`/trips/${trip_id}/budget`);
    } catch (err) {
        console.error("❌ Failed to update expense:", err);
        res.status(500).send("Error updating expense.");
    }
});


// Route: Add Item to Packing List
router.post('/:trip_id/packing_list/add', async (req, res) => {
    const { trip_id } = req.params;
    const { item_name } = req.body;
    const sql = "INSERT INTO packing_list (trip_id, item_name) VALUES (?, ?)";

    try {
        await db.query(sql, [trip_id, item_name]);
        res.redirect(`/trips/${trip_id}/packing_list`);
    } catch (err) {
        console.error("❌ DB Insert Error:", err);
        res.status(500).send("❌ DB Insert Error");
    }
});

// Route: Delete Item from Packing List
router.post('/:trip_id/packing_list/delete/:item_id', async (req, res) => {
    const { trip_id, item_id } = req.params;
    const sql = "DELETE FROM packing_list WHERE item_id = ? AND trip_id = ?";

    try {
        await db.query(sql, [item_id, trip_id]);
        res.redirect(`/trips/${trip_id}/packing_list`);
    } catch (err) {
        console.error("❌ Error deleting packing list item:", err);
        res.status(500).send("❌ Failed to delete item.");
    }
});

// Route: Update Packing List Item Name
router.post('/:trip_id/packing_list/edit/:item_id', async (req, res) => {
    const { trip_id, item_id } = req.params;
    const { item_name } = req.body;

    if (!item_name) {
        return res.status(400).send("Item name cannot be empty.");
    }

    const sql = "UPDATE packing_list SET item_name = ? WHERE item_id = ? AND trip_id = ?";

    try {
        await db.query(sql, [item_name, item_id, trip_id]);
        res.redirect(`/trips/${trip_id}/packing_list`);
    } catch (err) {
        console.error("❌ Failed to update item:", err);
        res.status(500).send("Failed to update item.");
    }
});

// Route: Update Packed Status
router.patch('/:trip_id/packing_list/update/:item_id', async (req, res) => {
    const { trip_id, item_id } = req.params;
    const { packed } = req.body;
    const sql = "UPDATE packing_list SET packed = ? WHERE item_id = ? AND trip_id = ?";

    try {
        await db.query(sql, [packed, item_id, trip_id]);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ DB Update Error:", err);
        res.status(500).json({ error: "DB Update Error" });
    }
});

// Route: Display Packing List Page
router.get('/:trip_id/packing_list', async (req, res) => {
    const { trip_id } = req.params;
    const tripQuery = "SELECT * FROM trips WHERE trip_id = ?";
    const itemsQuery = "SELECT * FROM packing_list WHERE trip_id = ?";

    try {
        const [tripResults] = await db.query(tripQuery, [trip_id]);
        if (tripResults.length === 0) return res.status(404).send("Trip not found.");
        const trip = tripResults[0];

        const [items] = await db.query(itemsQuery, [trip_id]);

        const totalItems = items.length;
        const packedItems = items.filter(item => item.packed).length;
        const progress = totalItems ? (packedItems / totalItems) * 100 : 0;
        // 🎯 Format trip start & end dates
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        res.render('pages/packing_list', { trip, packingList: items, progress: Math.round(progress), apiKey: process.env.GOOGLE_API_KEY });
    } catch (err) {
        console.error("❌ DB Fetch Error:", err);
        res.status(500).send("❌ DB Fetch Error");
    }
});


//  Route to render Itinerary Page (Updated with accommodations and formatted trip + activity dates)
router.get('/:trip_id/itinerary', async (req, res) => {
    const { trip_id } = req.params;

    const tripSql = "SELECT * FROM trips WHERE trip_id = ?";
    const activitiesSql = `
        SELECT * FROM itinerary
        WHERE trip_id = ? AND activity_date = ?
        ORDER BY start_time ASC
    `;
    const accommodationsSql = `
        SELECT * FROM accommodations
        WHERE trip_id = ?
    `;
    const bookingsSql = `
        SELECT * FROM bookings
        WHERE trip_id = ?
        AND (start_date <= ? AND end_date >= ?)
    `;

    try {
        const [tripResult] = await db.query(tripSql, [trip_id]);
        if (tripResult.length === 0) {
            return res.status(404).send("Trip not found.");
        }
        const trip = tripResult[0];

        //  Format trip start and end dates
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        // ✅ If no date is selected, default to the first date of the trip
        const selectedDateRaw = req.query.date || trip.start_date.toISOString().split('T')[0];
        const [year, month, day] = selectedDateRaw.split('-').map(Number);
        const selectedDateObj = new Date(year, month - 1, day);
        const selectedDateFormatted = selectedDateObj.toLocaleDateString('en-US', options);
        const selectedDate = selectedDateRaw; // Keep original string for comparison in EJS

        // ✅ Generate trip dates for pagination
        const tripDates = [];
        const startDate = new Date(trip.start_date);
        const endDate = new Date(trip.end_date);
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const edit = parseInt(req.query.edit) || null;

        let currentDate = new Date(trip.start_date);
        while (currentDate <= endDate) {
            tripDates.push({
                rawDate: currentDate.toISOString().split('T')[0],
                formattedDate: currentDate.toLocaleDateString('en-US', options)
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        const [activitiesResult] = await db.query(activitiesSql, [trip_id, selectedDate]);

        activitiesResult.forEach(activity => {
            activity.formattedActivityDate = new Date(activity.activity_date).toLocaleDateString('en-US', options);
        });

        const [accommodationsResult] = await db.query(accommodationsSql, [trip_id]);

        const [bookingsResult] = await db.query(bookingsSql, [trip_id, selectedDate, selectedDate]);
        bookingsResult.forEach(booking => {
            booking.formattedStartDate = new Date(booking.start_date).toLocaleDateString('en-US', options);
            booking.formattedEndDate = new Date(booking.end_date).toLocaleDateString('en-US', options);
        });

        res.render('pages/itinerary', {
            user: req.session.user || { username: "Guest" },
            trip,
            tripDates,
            totalDays,
            edit,
            activities: activitiesResult,
            accommodations: accommodationsResult,
            bookings: bookingsResult,
            selectedDate,
            selectedDateFormatted,
            apiKey: process.env.GOOGLE_API_KEY
        });
    } catch (err) {
        console.error("❌ Failed to load itinerary:", err);
        res.status(500).send("❌ Failed to load itinerary.");
    }
});

// ✍️ Add Activity to Itinerary with Correct Duration
router.post('/:trip_id/itinerary/add', async (req, res) => {
    const { trip_id } = req.params;
    const { activity_type, activity_name, activity_date, start_time, duration, location, details } = req.body;

    console.log(`✅ Duration received: ${duration}`);

    const sql = `
        INSERT INTO itinerary
        (trip_id, activity_type, activity_name, activity_date, start_time, duration, location, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        await db.query(sql, [trip_id, activity_type, activity_name, activity_date, start_time, duration, location, details]);
        console.log("✅ Activity added successfully");
        res.redirect(`/trips/${trip_id}/itinerary?date=${activity_date}`);
    } catch (err) {
        console.error("❌ Failed to add activity:", err);
        res.status(500).send("❌ Failed to add activity.");
    }
});

// Update Itinerary Item (POST)
router.post('/:trip_id/itinerary/update/:activity_id', async (req, res) => {
    const { trip_id, activity_id } = req.params;
    const { activity_type, activity_name, start_time, location, details } = req.body;

    const updateSql = `
      UPDATE itinerary
      SET activity_type = ?, activity_name = ?, start_time = ?, location = ?, details = ?
      WHERE trip_id = ? AND activity_id = ?
    `;

    try {
        await db.query(updateSql, [activity_type, activity_name, start_time, location, details, trip_id, activity_id]);
        const redirectDate = req.query.date || new Date().toISOString().split('T')[0];
        res.redirect(`/trips/${trip_id}/itinerary?date=${redirectDate}`);
    } catch (err) {
        console.error("❌ Failed to update activity:", err);
        res.status(500).send("❌ Failed to update activity.");
    }
});

// 🗑️ Delete Activity (Form-based POST)
router.post('/:trip_id/itinerary/delete/:activity_id', async (req, res) => {
    const { trip_id, activity_id } = req.params;
    const redirectDate = req.body.date;

    try {
        await db.query("DELETE FROM itinerary WHERE trip_id = ? AND activity_id = ?", [trip_id, activity_id]);
        res.redirect(`/trips/${trip_id}/itinerary?date=${redirectDate}`);
    } catch (err) {
        console.error("❌ Failed to delete activity:", err);
        res.status(500).send("❌ Failed to delete activity.");
    }
});

//estimate drive time route

router.post('/:trip_id/estimate-drive-time', async (req, res) => {
    const { start, end } = req.body;
    const apiKey = process.env.GOOGLE_API_KEY;

    console.log(`🚀 Received start: ${start}, end: ${end}`);
    if (!start || !end) {
        return res.status(400).json({ error: 'Missing start or end location.' });
    }

    try {
        const apiUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(start)}&destinations=${encodeURIComponent(end)}&key=${apiKey}`;

        console.log(`🌐 Request URL: ${apiUrl}`);  // ✅ Debug: View the exact request being sent

        const response = await axios.get(apiUrl);
        const data = response.data;

        console.log(`📝 Google API Response: ${JSON.stringify(data)}`);  // ✅ Debug the whole response

        if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === "OK") {
            const durationText = data.rows[0].elements[0].duration.text;
            console.log(`✅ Duration received: ${durationText}`);
            return res.json({ duration: durationText });
        } else {
            console.error('❌ Invalid response from Google API:', data);
            return res.status(400).json({ error: data });
        }
    } catch (error) {
        console.error('❌ Error fetching drive time:', error.message);
        return res.status(500).json({ error: 'Failed to calculate driving time.' });
    }
});

// Route: Calendar View Itinerary
router.get('/:trip_id/calendar_itinerary', async (req, res) => {
    const { trip_id } = req.params;
    const apiKey = process.env.GOOGLE_API_KEY;

    const tripSql = "SELECT * FROM trips WHERE trip_id = ?";
    const activitiesSql = "SELECT *, DATE_FORMAT(activity_date, '%Y-%m-%d') AS formatted_activity_date FROM itinerary WHERE trip_id = ? ORDER BY activity_date ASC";

    try {
        const [tripResult] = await db.query(tripSql, [trip_id]);
        if (tripResult.length === 0) {
            return res.status(404).send("Trip not found.");
        }
        const trip = tripResult[0];

        // Format trip dates
        const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        const [activitiesResult] = await db.query(activitiesSql, [trip_id]);

        // Generate tripDates list
        const tripDates = [];
        let currentDate = new Date(trip.start_date);
        let endDate = new Date(trip.end_date);

        while (currentDate <= endDate) {
            tripDates.push({
                rawDate: currentDate.toISOString().split('T')[0], // Ensures YYYY-MM-DD format
                formattedDate: currentDate.toLocaleDateString('en-US', options)
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        res.render('pages/calendar_itinerary', {
            user: req.session.user || { username: "Guest" },
            trip,
            activities: activitiesResult,
            tripDates,
            apiKey
        });
    } catch (err) {
        console.error("❌ Failed to load calendar itinerary:", err);
        res.status(500).send("Failed to fetch activities.");
    }
});

// Upload booking PDF
router.post('/:trip_id/bookings/upload', upload.single('bookingFile'), async (req, res) => {
    const { trip_id } = req.params;
    const { filename, originalname } = req.file;

    const sql = "INSERT INTO bookings (trip_id, file_name, original_name) VALUES (?, ?, ?)";
    try {
        await db.query(sql, [trip_id, filename, originalname]);
        console.log("✅ Booking file uploaded.");
        res.redirect(`/trips/${trip_id}/bookings`);
    } catch (err) {
        console.error("❌ DB Insert Error:", err);
        res.status(500).send("❌ Failed to upload booking file.");
    }
});

// ✍️ Route to Add a Booking (With File Upload Support)
router.post('/:trip_id/bookings/add', upload.single('bookingFile'), async (req, res) => {
    const { trip_id } = req.params;
    let { accommodation_type, vendor_name, start_date, end_date, location, start_location, end_location, booking_link } = req.body;

    // Convert blank dates to null
    if (!end_date || end_date.trim() === '') {
        end_date = null;
    }

    let file_name = null;
    let original_name = null;

    if (req.file) {
        file_name = req.file.filename;
        original_name = req.file.originalname;
    }

    const sql = `
        INSERT INTO bookings
        (trip_id, accommodation_type, vendor_name, start_date, end_date, location, start_location, end_location, booking_link, file_name, original_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        await db.query(sql, [trip_id, accommodation_type, vendor_name, start_date, end_date, location, start_location, end_location, booking_link, file_name, original_name]);
        res.redirect(`/trips/${trip_id}/bookings`);
    } catch (err) {
        console.error("❌ Error adding booking:", err);
        res.status(500).send("Error adding booking.");
    }
});

// Retrieve bookings for a trip
router.get('/:trip_id/bookings', async (req, res) => {
    const { trip_id } = req.params;
    const edit = req.query.edit || null;

    const tripQuery = "SELECT * FROM trips WHERE trip_id = ?";
    const bookingsQuery = `
  SELECT *,
         DATE_FORMAT(start_date, '%Y-%m-%d') AS formatted_start_date,
         DATE_FORMAT(end_date, '%Y-%m-%d') AS formatted_end_date
  FROM bookings
  WHERE trip_id = ?
`;

    try {
        const [tripResults] = await db.query(tripQuery, [trip_id]);
        if (tripResults.length === 0) {
            return res.status(404).send("Trip not found.");
        }

        const trip = tripResults[0];

        // Format trip dates
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        const [bookings] = await db.query(bookingsQuery, [trip_id]);
        const safeEndDate = bookings.end_date && bookings.end_date.trim() !== '' ? bookings.end_date : null;

        res.render('pages/bookings', { trip, bookings, safeEndDate, apiKey: process.env.GOOGLE_API_KEY, edit });
    } catch (err) {
        console.error("❌ Failed to retrieve bookings:", err);
        res.status(500).send("Failed to retrieve bookings.");
    }
});

// Update booking entry
router.post('/:trip_id/bookings/update/:booking_id', async (req, res) => {
    const { trip_id, booking_id } = req.params;
    let { accommodation_type, vendor_name, start_date, end_date } = req.body;

    if (!end_date || end_date.trim() === '') {
        end_date = null;
    }

    const updateSql = `
        UPDATE bookings
        SET accommodation_type = ?, vendor_name = ?, start_date = ?, end_date = ?
        WHERE booking_id = ? AND trip_id = ?
    `;

    try {
        await db.query(updateSql, [accommodation_type, vendor_name, start_date, end_date, booking_id, trip_id]);
        res.redirect(`/trips/${trip_id}/bookings`);
    } catch (err) {
        console.error("❌ Failed to update booking:", err);
        res.status(500).send("Failed to update booking.");
    }
});

// Download Booking
router.get('/:trip_id/bookings/download/:booking_id', async (req, res) => {
    const { booking_id } = req.params;
    const sql = "SELECT * FROM bookings WHERE booking_id = ?";

    try {
        const [results] = await db.query(sql, [booking_id]);
        if (results.length === 0) return res.status(404).send("File not found.");
        const filePath = path.join(__dirname, '../uploads/bookings', results[0].file_name);
        res.download(filePath, results[0].original_name);
    } catch (err) {
        console.error("❌ Failed to download booking:", err);
        res.status(404).send("File not found.");
    }
});

// Delete Booking
router.post('/:trip_id/bookings/delete/:booking_id', async (req, res) => {
    const { trip_id, booking_id } = req.params;
    const sql = "DELETE FROM bookings WHERE booking_id = ?";
    try {
        await db.query(sql, [booking_id]);
        console.log(`🗑 File ${booking_id} deleted.`);
        res.redirect(`/trips/${trip_id}/bookings`);
    } catch (err) {
        console.error("❌ Failed to delete file:", err);
        res.status(500).send("Failed to delete file.");
    }
});



//Route to upcomming trips
router.get('/upcoming', async (req, res) => {
    const userId = req.session.user?.id || 1;  // 👈 Hardcoded fallback for testing
    const today = new Date().toISOString().split('T')[0];

    console.log("🔎 Debug - userId:", userId);
    console.log("🔎 Debug - today:", today);

    const sql = "SELECT * FROM trips WHERE user_id = ? AND start_date >= ? ORDER BY start_date ASC";
    try {
        const [results] = await db.query(sql, [userId, today]);
        console.log("🔎 Debug - Query Results:", results);

        if (results.length === 0) {
            console.warn("⚠️ No upcoming trips found for user:", userId);
        }

        results.forEach(trip => {
            trip.formattedStartDate = new Date(trip.start_date).toDateString();
            trip.formattedEndDate = new Date(trip.end_date).toDateString();
        });

        res.render('pages/upcoming_trips', {
            trips: results,
            apiKey: process.env.GOOGLE_API_KEY
        });
    } catch (err) {
        console.error("❌ Error fetching trips:", err);
        res.status(500).send("Failed to retrieve upcoming trips.");
    }
});

//route to past trips
router.get('/past', async (req, res) => {
    const userId = req.session.user?.id || 1;  // 👈 Hardcoded fallback for testing
    const today = new Date().toISOString().split('T')[0];

    console.log("🔎 Debug - userId:", userId);
    console.log("🔎 Debug - today:", today);

    const sql = "SELECT * FROM trips WHERE user_id = ? AND end_date <= ? ORDER BY start_date ASC";
    try {
        const [results] = await db.query(sql, [userId, today]);
        console.log("🔎 Debug - Query Results:", results);

        if (results.length === 0) {
            console.warn("⚠️ No past trips found for user:", userId);
        }

        results.forEach(trip => {
            trip.formattedStartDate = new Date(trip.start_date).toDateString();
            trip.formattedEndDate = new Date(trip.end_date).toDateString();
        });

        res.render('pages/past_trips', {
            trips: results,
            apiKey: process.env.GOOGLE_API_KEY
        });
    } catch (err) {
        console.error("❌ Error fetching trips:", err);
        res.status(500).send("Failed to retrieve past trips.");
    }
});

//route to unscheduled trips
router.get('/unscheduled', async (req, res) => {
    const userId = req.session.user?.id || 1;  // 👈 Hardcoded fallback for testing
    const today = new Date().toISOString().split('T')[0];

    console.log("🔎 Debug - userId:", userId);
    console.log("🔎 Debug - today:", today);

    const sql = "SELECT * FROM trips WHERE user_id = ? AND start_date is null ORDER BY trip_name ASC";
    try {
        const [results] = await db.query(sql, [userId, today]);
        console.log("🔎 Debug - Query Results:", results);

        if (results.length === 0) {
            console.warn("⚠️ No unscheduled trips found for user:", userId);
        }

        results.forEach(trip => {
            trip.formattedStartDate = new Date(trip.start_date).toDateString();
            trip.formattedEndDate = new Date(trip.end_date).toDateString();
        });

        res.render('pages/unscheduled_trips', {
            trips: results,
            apiKey: process.env.GOOGLE_API_KEY
        });
    } catch (err) {
        console.error("❌ Error fetching trips:", err);
        res.status(500).send("Failed to retrieve unscheduled trips.");
    }
});

//route to shared trips
router.get('/shared', async (req, res) => {
    const userId = req.session.user?.id || 1;  // 👈 Hardcoded fallback for testing
    const today = new Date().toISOString().split('T')[0];

    console.log("🔎 Debug - userId:", userId);
    console.log("🔎 Debug - today:", today);

    const sql = "SELECT * FROM trips t join trip_users s on s.trip_id = t.trip_id WHERE s.user_id = ? AND s.role != 'owner' ORDER BY trip_name ASC";
    try {
        const [results] = await db.query(sql, [userId, today]);
        console.log("🔎 Debug - Query Results:", results);

        if (results.length === 0) {
            console.warn("⚠️ No shared trips found for user:", userId);
        }

        results.forEach(trip => {
            trip.formattedStartDate = new Date(trip.start_date).toDateString();
            trip.formattedEndDate = new Date(trip.end_date).toDateString();
        });

        res.render('pages/shared_trips', {
            trips: results,
            apiKey: process.env.GOOGLE_API_KEY
        });
    } catch (err) {
        console.error("❌ Error fetching trips:", err);
        res.status(500).send("Failed to retrieve shared trips.");
    }
});


// Route to show the trip dashboard
// This route will display the trip details and map
router.get('/:trip_id', async (req, res) => {
    const tripId = req.params.trip_id;

    const tripSql = "SELECT * FROM trips WHERE trip_id = ?";
    const sharedUsersSql = `
        SELECT distinct users.user_id, users.email, trip_users.role
        FROM trip_users
        JOIN users ON trip_users.user_id = users.user_id
        WHERE trip_users.trip_id = ?
    `;

    try {
        const [tripResults] = await db.query(tripSql, [tripId]);
        if (tripResults.length === 0) {
            return res.status(404).send("Trip not found.");
        }

        let trip = tripResults[0];

        // Format dates
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        const [sharedUsers] = await db.query(sharedUsersSql, [tripId]);

        res.render('pages/trip_dashboard', {
            trip,
            sharedUsers,  // ✅ Pass shared users to the EJS file
            apiKey: process.env.GOOGLE_API_KEY
        });
    } catch (err) {
        console.error("❌ Error fetching trip:", err);
        res.status(404).send("Trip not found.");
    }
});




module.exports = router;
