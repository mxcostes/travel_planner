const express = require('express');
const router = express.Router();
const db = require('../config/db');
const upload = require('../config/multer');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Example route to verify it's working
router.get('/', (req, res) => {
    res.send("Trips route is working!");
});

router.get('/test', (req, res) => {
    console.log("✅ /test route is working.");
    res.send("🟢 Test route works!");
});

//Trip Add/Create page and funtion
router.get('/trip_add', (req, res) => {
    res.render('pages/trip_add', {
        user: req.session.user || { username: "Guest" },
        apiKey: process.env.GOOGLE_API_KEY  // Pass API key to EJS
    });
});

// Handle Trip Creation

router.post('/create', (req, res) => {
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

    let sql = "INSERT INTO trips (user_id, trip_name, start_date, end_date, start_location, end_location) VALUES (?, ?, ?, ?, ?, ?)";

    db.query(sql, [userId, trip_name, start_date, end_date, start_location, end_location], (err, result) => {
        if (err) {
            console.error("❌ MySQL Error:", err);
            return res.status(500).send("Database error. Please try again.");
        }
        console.log("✅ Trip created successfully:", result);
        // Capture the trip_id of the newly created trip
        const newTripId = result.insertId;

        // Redirect to the specific trip dashboard
        res.redirect(`/trips/${newTripId}`);
    });
});

router.get('/:trip_id/edit', (req, res) => {
    const { trip_id } = req.params;
    const tripSql = "SELECT * FROM trips WHERE trip_id = ?";

    db.query(tripSql, [trip_id], (err, tripResult) => {
        if (err || tripResult.length === 0) {
            console.error("❌ Trip not found:", err);
            return res.status(404).send("Trip not found.");
        }

        const trip = tripResult[0];

        res.render('pages/edit_trip', {
            user: req.session.user || { username: "Guest" },
            trip,
            apiKey: process.env.GOOGLE_API_KEY
        });
    });
});

router.post('/:trip_id/edit', (req, res) => {
    const { trip_id } = req.params;
    const { trip_name, start_location, end_location, start_date, end_date } = req.body;

    console.log("🔍 Debug - Received Data:", req.body);

    const sql = `
        UPDATE trips 
        SET trip_name = ?, start_location = ?, end_location = ?, start_date = ?, end_date = ?
        WHERE trip_id = ?
    `;

    db.query(sql, [trip_name, start_location, end_location, start_date, end_date, trip_id], (err, result) => {
        if (err) {
            console.error("❌ Failed to update trip:", err);
            return res.status(500).send("❌ Failed to update trip.");
        }
        console.log("✅ Trip updated successfully");
        res.redirect(`/trips/${trip_id}/`);
    });
});

router.get('/:trip_id/budget', (req, res) => {
    const { trip_id } = req.params;

    // ✅ Define all SQL queries before usage
    const sqlTrip = "SELECT * FROM trips WHERE trip_id = ?";
    const sqlExpenses = "SELECT * FROM expenses WHERE trip_id = ? ORDER BY expense_date DESC";

    db.query(sqlTrip, [trip_id], (err, tripResult) => {
        if (err) {
            console.error("❌ Database Error:", err);
            return res.status(500).send("❌ Failed to fetch trip details.");
        }

        if (tripResult.length === 0) {
            console.warn("⚠️ Trip not found for ID:", trip_id);
            return res.status(404).send("Trip not found.");
        }

        const trip = tripResult[0];

        // 🎯 Format trip start & end dates
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        db.query(sqlExpenses, [trip_id], (err, expenses) => {
            if (err) {
                console.error("❌ Error fetching expenses:", err);
                return res.status(500).send("❌ Failed to fetch expenses.");
            }

            // ✅ Expense Summaries by Category & Date
            const summary = { byCategory: {}, byDate: {} };
            expenses.forEach(expense => {
                expense.formattedDate = new Date(expense.expense_date).toLocaleDateString('en-US', options);

                // ✅ Ensure amount is a valid float
                const expenseAmount = parseFloat(expense.amount) || 0.00;

                // 🏷️ Group by Category
                summary.byCategory[expense.category] = 
                    (summary.byCategory[expense.category] || 0) + expenseAmount;

                // 📅 Group by Date
                summary.byDate[expense.formattedDate] = 
                    (summary.byDate[expense.formattedDate] || 0) + expenseAmount;
            });

            res.render('pages/budget', { 
                user: req.session.user || { username: "Guest" },
                trip,
                expenses,
                expenseSummary: summary,
                apiKey: process.env.GOOGLE_API_KEY  // ✅ Ensures API key is passed
            });
        });
    });
});

// ✍️ Route to Add a New Expense
router.post('/:trip_id/budget/add', (req, res) => {
    const { trip_id } = req.params;
    const { category, amount, description, expense_date } = req.body;

    if (!category || !amount || !expense_date) {
        return res.status(400).send("❌ Missing required fields.");
    }

    // ✅ SQL for inserting a new expense
    const sqlInsert = `
        INSERT INTO expenses (trip_id, category, amount, description, expense_date) 
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sqlInsert, [trip_id, category, parseFloat(amount), description, expense_date], (err) => {
        if (err) {
            console.error("❌ Error inserting expense:", err);
            return res.status(500).send("❌ Failed to add expense.");
        }

        console.log("✅ Expense added successfully");

        // ✅ Fetch updated expenses after insertion
        const sqlFetchExpenses = "SELECT * FROM expenses WHERE trip_id = ? ORDER BY expense_date DESC";

        db.query(sqlFetchExpenses, [trip_id], (err, expenses) => {
            if (err) {
                console.error("❌ Error fetching expenses:", err);
                return res.status(500).send("❌ Failed to fetch updated expenses.");
            }

            // 🎯 Format expense dates and summarize spending
            const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
            const summary = { byCategory: {}, byDate: {} };

            expenses.forEach(expense => {
                expense.amount = parseFloat(expense.amount) || 0.00;  // ✅ Ensure amount is always a number
                expense.formattedDate = new Date(expense.expense_date).toLocaleDateString('en-US', options);

                // 🏷️ Grouping by Category
                summary.byCategory[expense.category] = 
                    (summary.byCategory[expense.category] || 0) + expense.amount;

                // 📅 Grouping by Date
                summary.byDate[expense.formattedDate] = 
                    (summary.byDate[expense.formattedDate] || 0) + expense.amount;
            });

            // ✅ Redirect back to budget page with updated expenses
            res.redirect(`/trips/${trip_id}/budget`);
        });
    });
});

// Route: Add Item to Packing List
router.post('/:trip_id/packing_list/add', (req, res) => {
    const { trip_id } = req.params;
    const { item_name } = req.body;
    const sql = "INSERT INTO packing_list (trip_id, item_name) VALUES (?, ?)";

    db.query(sql, [trip_id, item_name], (err) => {
        if (err) return res.status(500).send("❌ DB Insert Error");
        res.redirect(`/trips/${trip_id}/packing_list`);
    });
});

// Route: Update Packed Status
router.patch('/:trip_id/packing_list/update/:item_id', (req, res) => {
    const { trip_id, item_id } = req.params;
    const { packed } = req.body;
    const sql = "UPDATE packing_list SET packed = ? WHERE item_id = ? AND trip_id = ?";

    db.query(sql, [packed, item_id, trip_id], (err) => {
        if (err) return res.status(500).json({ error: "❌ DB Update Error" });
        res.json({ success: true });
    });
});

// Route: Display Packing List Page
router.get('/:trip_id/packing_list', (req, res) => {
    const { trip_id } = req.params;
    const tripQuery = "SELECT * FROM trips WHERE trip_id = ?";
    const itemsQuery = "SELECT * FROM packing_list WHERE trip_id = ?";

    db.query(tripQuery, [trip_id], (err, tripResults) => {
        if (err || tripResults.length === 0) return res.status(404).send("Trip not found.");
        const trip = tripResults[0];

        db.query(itemsQuery, [trip_id], (err, items) => {
            if (err) return res.status(500).send("❌ DB Fetch Error");

            const totalItems = items.length;
            const packedItems = items.filter(item => item.packed).length;
            const progress = totalItems ? (packedItems / totalItems) * 100 : 0;
            // 🎯 Format trip start & end dates
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

            res.render('pages/packing_list', { trip, packingList: items, progress: Math.round(progress), apiKey: process.env.GOOGLE_API_KEY });
        });
    });
});


// // 🌟 Route to render Itinerary Page (Updated with accommodations and formatted trip + activity dates)
// router.get('/:trip_id/itinerary', (req, res) => {
//     const { trip_id } = req.params;
//     const selectedDate = req.query.date || new Date().toISOString().split('T')[0];

//     const tripSql = "SELECT * FROM trips WHERE trip_id = ?";
//     const activitiesSql = `
//         SELECT * FROM itinerary 
//         WHERE trip_id = ? AND activity_date = ?
//         ORDER BY start_time ASC
//     `;
//     const accommodationsSql = `
//         SELECT * FROM accommodations
//         WHERE trip_id = ?
//     `;

//     db.query(tripSql, [trip_id], (err, tripResult) => {
//         if (err || tripResult.length === 0) {
//             console.error("❌ Trip not found:", err);
//             return res.status(404).send("Trip not found.");
//         }
//         const trip = tripResult[0];

//         // 🎯 Format trip start and end dates
//         const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
//         trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
//         trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

//         db.query(activitiesSql, [trip_id, selectedDate], (err, activitiesResult) => {
//             if (err) return res.status(500).send("❌ Failed to fetch activities.");

//             // 🎯 Format activity dates
//             activitiesResult.forEach(activity => {
//                 activity.formattedActivityDate = new Date(activity.activity_date).toLocaleDateString('en-US', options);
//             });

//             db.query(accommodationsSql, [trip_id], (err, accommodationsResult) => {
//                 if (err) return res.status(500).send("❌ Failed to fetch accommodations.");

//                 res.render('pages/itinerary', {
//                     user: req.session.user || { username: "Guest" },
//                     trip,
//                     activities: activitiesResult,
//                     accommodations: accommodationsResult,
//                     selectedDate,
//                     apiKey: process.env.GOOGLE_API_KEY
//                 });
//             });
//         });
//     });
// });
// 🌟 Route to render Itinerary Page (Updated with accommodations and formatted trip + activity dates)
router.get('/:trip_id/itinerary', (req, res) => {
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

    db.query(tripSql, [trip_id], (err, tripResult) => {
        if (err || tripResult.length === 0) {
            console.error("❌ Trip not found:", err);
            return res.status(404).send("Trip not found.");
        }
        const trip = tripResult[0];

        // 🎯 Format trip start and end dates
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        // ✅ If no date is selected, default to the **first date of the trip**
        let selectedDate = req.query.date || new Date(trip.start_date).toISOString().split('T')[0];
        let selectedDateFormatted = new Date(selectedDate).toLocaleDateString('en-US', options);

        // ✅ Calculate totalDays for pagination
        const startDate = new Date(trip.start_date);
        const endDate = new Date(trip.end_date);
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

        // ✅ Generate all trip dates for pagination
        const tripDates = [];
        const currentDate = new Date(trip.start_date);

        while (currentDate <= endDate) {
            tripDates.push({
                rawDate: currentDate.toISOString().split('T')[0],
                formattedDate: currentDate.toLocaleDateString('en-US', options)
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        db.query(activitiesSql, [trip_id, selectedDate], (err, activitiesResult) => {
            if (err) return res.status(500).send("❌ Failed to fetch activities.");

            // 🎯 Format activity dates
            activitiesResult.forEach(activity => {
                activity.formattedActivityDate = new Date(activity.activity_date).toLocaleDateString('en-US', options);
            });

            db.query(accommodationsSql, [trip_id], (err, accommodationsResult) => {
                if (err) return res.status(500).send("❌ Failed to fetch accommodations.");

                res.render('pages/itinerary', {
                    user: req.session.user || { username: "Guest" },
                    trip,
                    tripDates,                    // ✅ Passing dates for pagination
                    totalDays,                    // ✅ Passing totalDays to EJS
                    activities: activitiesResult,
                    accommodations: accommodationsResult,
                    selectedDate,
                    selectedDateFormatted,
                    apiKey: process.env.GOOGLE_API_KEY
                });
            });
        });
    });
});

// ✍️ Add Activity to Itinerary with Correct Duration
router.post('/:trip_id/itinerary/add', (req, res) => {
    const { trip_id } = req.params;
    const { activity_type, activity_name, activity_date, start_time, duration, location, details } = req.body;

    console.log(`✅ Duration received: ${duration}`); // Debugging line

    const sql = `
        INSERT INTO itinerary 
        (trip_id, activity_type, activity_name, activity_date, start_time, duration, location, details) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [trip_id, activity_type, activity_name, activity_date, start_time, duration, location, details], (err) => {
        if (err) {
            console.error("❌ Failed to add activity:", err);
            return res.status(500).send("❌ Failed to add activity.");
        }
        console.log("✅ Activity added successfully");

        // ✅ Redirect to the itinerary page, ensuring we view the date the activity was added for
        res.redirect(`/trips/${trip_id}/itinerary?date=${activity_date}`);
    });
});

// ✏️ Update Existing Activity
router.put('/:trip_id/itinerary/edit/:activity_id', (req, res) => {
    const { trip_id, activity_id } = req.params;
    const { name, date, time, duration, location, details } = req.body;
    const sql = "UPDATE itinerary SET activity_name = ?, activity_date = ?, start_time = ?, duration = ?, location = ?, details = ? WHERE trip_id = ? AND activity_id = ?";

    db.query(sql, [name, date, time, duration, location, details, trip_id, activity_id], (err) => {
        if (err) return res.status(500).send("❌ Failed to update activity.");
        res.sendStatus(200);
    });
});

// 🗑️ Delete Activity
router.delete('/:trip_id/itinerary/delete/:activity_id', (req, res) => {
    const { trip_id, activity_id } = req.params;
    db.query("DELETE FROM itinerary WHERE trip_id = ? AND activity_id = ?", [trip_id, activity_id], (err) => {
        if (err) return res.status(500).send("❌ Failed to delete activity.");
        res.sendStatus(200);
    });
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

// Upload booking PDF
router.post('/:trip_id/bookings/upload', upload.single('bookingFile'), (req, res) => {
    const { trip_id } = req.params;
    const { filename, originalname } = req.file;

    const sql = "INSERT INTO bookings (trip_id, file_name, original_name) VALUES (?, ?, ?)";
    db.query(sql, [trip_id, filename, originalname], (err) => {
        if (err) {
            console.error("❌ DB Insert Error:", err);
            return res.status(500).send("❌ Failed to upload booking file.");
        }
        console.log("✅ Booking file uploaded.");
        res.redirect(`/trips/${trip_id}/bookings`);
    });
});

// Retrieve bookings for a trip
router.get('/:trip_id/bookings', (req, res) => {
    const { trip_id } = req.params;
    const tripQuery = "SELECT * FROM trips WHERE trip_id = ?";
    const bookingsQuery = "SELECT * FROM bookings WHERE trip_id = ?";

    db.query(tripQuery, [trip_id], (err, tripResults) => {
        if (err || tripResults.length === 0) return res.status(404).send("Trip not found.");
        const trip = tripResults[0];

         // 🎯 Format trip dates
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
    trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);
    

        db.query(bookingsQuery, [trip_id], (err, bookings) => {
            if (err) return res.status(500).send("Failed to retrieve bookings.");
            res.render('pages/bookings', { trip, bookings, apiKey: process.env.GOOGLE_API_KEY });
        });
    });
});

// Download Booking
router.get('/:trip_id/bookings/download/:booking_id', (req, res) => {
    const { booking_id } = req.params;
    const sql = "SELECT * FROM bookings WHERE booking_id = ?";


    db.query(sql, [booking_id], (err, results) => {
        if (err || results.length === 0) return res.status(404).send("File not found.");
        const filePath = path.join(__dirname, '../uploads/bookings', results[0].file_name);
        res.download(filePath, results[0].original_name);
    });
});

// Delete Booking
router.post('/:trip_id/bookings/delete/:booking_id', (req, res) => {
    const { trip_id, booking_id } = req.params;
    const sql = "DELETE FROM bookings WHERE booking_id = ?";
    db.query(sql, [booking_id], (err) => {
        if (err) return res.status(500).send("Failed to delete file.");
        console.log(`🗑 File ${booking_id} deleted.`);
        res.redirect(`/trips/${trip_id}/bookings`);
    });
});



//Route to upcomming trips
router.get('/upcoming', (req, res) => {
    const userId = req.session.user?.id || 1;  // 👈 Hardcoded fallback for testing
    const today = new Date().toISOString().split('T')[0];

    console.log("🔎 Debug - userId:", userId);
    console.log("🔎 Debug - today:", today);

    let sql = "SELECT * FROM trips WHERE user_id = ? AND start_date >= ? ORDER BY start_date ASC";
    db.query(sql, [userId, today], (err, results) => {
        if (err) {
            console.error("❌ Error fetching trips:", err);
            return res.status(500).send("Failed to retrieve upcoming trips.");
        }
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
    });
});

//route to past trips
router.get('/past', (req, res) => {
    const userId = req.session.user?.id || 1;  // 👈 Hardcoded fallback for testing
    const today = new Date().toISOString().split('T')[0];

    console.log("🔎 Debug - userId:", userId);
    console.log("🔎 Debug - today:", today);

    let sql = "SELECT * FROM trips WHERE user_id = ? AND start_date <= ? ORDER BY start_date ASC";
    db.query(sql, [userId, today], (err, results) => {
        if (err) {
            console.error("❌ Error fetching trips:", err);
            return res.status(500).send("Failed to retrieve upcoming trips.");
        }
        console.log("🔎 Debug - Query Results:", results);

        if (results.length === 0) {
            console.warn("⚠️ No upcoming trips found for user:", userId);
        }

        results.forEach(trip => {
            trip.formattedStartDate = new Date(trip.start_date).toDateString();
            trip.formattedEndDate = new Date(trip.end_date).toDateString();
        });

        res.render('pages/past_trips', {
            trips: results,
            apiKey: process.env.GOOGLE_API_KEY
        });
    });
});

//route to unscheduled trips
router.get('/unscheduled', (req, res) => {
    const userId = req.session.user?.id || 1;  // 👈 Hardcoded fallback for testing
    const today = new Date().toISOString().split('T')[0];

    console.log("🔎 Debug - userId:", userId);
    console.log("🔎 Debug - today:", today);

    let sql = "SELECT * FROM trips WHERE user_id = ? AND start_date is null ORDER BY trip_name ASC";
    db.query(sql, [userId, today], (err, results) => {
        if (err) {
            console.error("❌ Error fetching trips:", err);
            return res.status(500).send("Failed to retrieve unscheduled trips.");
        }
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
    });
});


// Route to show the trip dashboard
// This route will display the trip details and map
router.get('/:trip_id', (req, res) => {
    const tripId = req.params.trip_id;

    let sql = "SELECT * FROM trips WHERE trip_id = ?";
    db.query(sql, [tripId], (err, results) => {
        if (err || results.length === 0) {
            console.error("❌ Error fetching trip:", err);
            return res.status(404).send("Trip not found.");
        }

        let trip = results[0];

        // Format dates
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        // Ensure API key is loaded
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            console.error("❌ Google Maps API Key is missing.");
            return res.status(500).send("Google Maps API Key is missing.");
        }

        res.render('pages/trip_dashboard', { trip, apiKey });
    });
});




module.exports = router;