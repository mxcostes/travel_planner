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

// Edit Trip Page and Function
router.get('/:trip_id/edit', checkTripAccess("editor"), (req, res) => {
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

// Handle Trip Update
router.post('/:trip_id/edit', checkTripAccess("editor"), (req, res) => {
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

// Share Trip
router.post('/:trip_id/share', checkTripAccess("owner"), (req, res) => {
    const { trip_id } = req.params;
    const { user_email, role } = req.body;

    const getUserSql = "SELECT user_id FROM users WHERE email = ?";
    const insertShareSql = "INSERT INTO trip_users (trip_id, user_id, role) VALUES (?, ?, ?)";

    db.query(getUserSql, [user_email], (err, userResult) => {
        if (err || userResult.length === 0) {
            return res.status(404).send("User not found.");
        }
        const user_id = userResult[0].user_id;

        db.query(insertShareSql, [trip_id, user_id, role], (err) => {
            if (err) return res.status(500).send("Failed to share trip.");
            res.redirect(`/trips/${trip_id}`);
        });
    });
});

//update user permissions
router.post('/:trip_id/share/update', checkTripAccess("owner"), (req, res) => {
    const { trip_id } = req.params;
    const { user_id, role } = req.body;

    const updateRoleSql = "UPDATE trip_users SET role = ? WHERE trip_id = ? AND user_id = ?";

    db.query(updateRoleSql, [role, trip_id, user_id], (err) => {
        if (err) return res.status(500).send("Failed to update role.");
        res.redirect(`/trips/${trip_id}/manage-sharing`);
    });
});

//remove user permissions
router.post('/:trip_id/share/remove', checkTripAccess("owner"), (req, res) => {
    const { trip_id } = req.params;
    const { user_id } = req.body;

    const deleteUserSql = "DELETE FROM trip_users WHERE trip_id = ? AND user_id = ?";

    db.query(deleteUserSql, [trip_id, user_id], (err) => {
        if (err) return res.status(500).send("Failed to remove user.");
        res.redirect(`/trips/${trip_id}/manage-sharing`);
    });
});

// Route to Delete Trip
router.post('/:trip_id/delete', checkTripAccess("owner"), (req, res) => {
    const { trip_id } = req.params;

    const deleteTripSql = "DELETE FROM trips WHERE trip_id = ?";

    db.query(deleteTripSql, [trip_id], (err) => {
        if (err) return res.status(500).send("Failed to delete trip.");
        res.redirect('/dashboard');
    });
});

//Render budget page
router.get('/:trip_id/budget', checkTripAccess("viewer"), (req, res) => {
    const { trip_id } = req.params;

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

        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        db.query(sqlExpenses, [trip_id], (err, expenses) => {
            if (err) {
                console.error("❌ Error fetching expenses:", err);
                return res.status(500).send("❌ Failed to fetch expenses.");
            }

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

        console.log("Expense added successfully");

        // Fetch updated expenses after insertion
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

            // Redirect back to budget page with updated expenses
            res.redirect(`/trips/${trip_id}/budget`);
        });
    });
});

router.post('/:trip_id/budget/delete/:expense_id', (req, res) => {
    const { trip_id, expense_id } = req.params;

    const sql = "DELETE FROM expenses WHERE expense_id = ? AND trip_id = ?";

    db.query(sql, [expense_id, trip_id], (err) => {
        if (err) {
            console.error("❌ Failed to delete expense:", err);
            return res.status(500).send("Error deleting expense.");
        }
        res.redirect(`/trips/${trip_id}/budget`);
    });
});

router.post('/:trip_id/budget/update/:expense_id', (req, res) => {
    const { trip_id, expense_id } = req.params;
    const { category, description, amount, expense_date } = req.body;

    const sql = `
        UPDATE expenses 
        SET category = ?, description = ?, amount = ?, expense_date = ?
        WHERE expense_id = ? AND trip_id = ?
    `;

    db.query(sql, [category, description, parseFloat(amount), expense_date, expense_id, trip_id], (err) => {
        if (err) {
            console.error("❌ Failed to update expense:", err);
            return res.status(500).send("Error updating expense.");
        }
        res.redirect(`/trips/${trip_id}/budget`);
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

// Route: Delete Item from Packing List
router.post('/:trip_id/packing_list/delete/:item_id', (req, res) => {
    const { trip_id, item_id } = req.params;
    const sql = "DELETE FROM packing_list WHERE item_id = ? AND trip_id = ?";

    db.query(sql, [item_id, trip_id], (err) => {
        if (err) {
            console.error("❌ Error deleting packing list item:", err);
            return res.status(500).send("❌ Failed to delete item.");
        }
        res.redirect(`/trips/${trip_id}/packing_list`);
    });
});

// Route: Update Packing List Item Name
router.post('/:trip_id/packing_list/edit/:item_id', (req, res) => {
    const { trip_id, item_id } = req.params;
    const { item_name } = req.body;

    if (!item_name) {
        return res.status(400).send("Item name cannot be empty.");
    }

    const sql = "UPDATE packing_list SET item_name = ? WHERE item_id = ? AND trip_id = ?";

    db.query(sql, [item_name, item_id, trip_id], (err) => {
        if (err) {
            console.error("❌ Failed to update item:", err);
            return res.status(500).send("Failed to update item.");
        }
        res.redirect(`/trips/${trip_id}/packing_list`);
    });
});

// Route: Update Packed Status
router.patch('/:trip_id/packing_list/update/:item_id', (req, res) => {
    const { trip_id, item_id } = req.params;
    const { packed } = req.body;
    const sql = "UPDATE packing_list SET packed = ? WHERE item_id = ? AND trip_id = ?";

    db.query(sql, [packed, item_id, trip_id], (err) => {
        if (err) return res.status(500).json({ error: "DB Update Error" });
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


//  Route to render Itinerary Page (Updated with accommodations and formatted trip + activity dates)
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
    const bookingsSql = `
        SELECT * FROM bookings
        WHERE trip_id = ? 
        AND (start_date <= ? AND end_date >= ?)
    `;

    db.query(tripSql, [trip_id], (err, tripResult) => {
        if (err || tripResult.length === 0) {
            console.error(" Trip not found:", err);
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

        db.query(activitiesSql, [trip_id, selectedDate], (err, activitiesResult) => {
            if (err) return res.status(500).send("❌ Failed to fetch activities.");

            activitiesResult.forEach(activity => {
                activity.formattedActivityDate = new Date(activity.activity_date).toLocaleDateString('en-US', options);
            });

            db.query(accommodationsSql, [trip_id], (err, accommodationsResult) => {
                if (err) return res.status(500).send("❌ Failed to fetch accommodations.");

                db.query(bookingsSql, [trip_id, selectedDate, selectedDate], (err, bookingsResult) => {
                    if (err) return res.status(500).send("❌ Failed to fetch bookings.");
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
                });
            });
        });
    });
});

// ✍️ Add Activity to Itinerary with Correct Duration
router.post('/:trip_id/itinerary/add', (req, res) => {
    const { trip_id } = req.params;
    const { activity_type, activity_name, activity_date, start_time, duration, location, details } = req.body;

    console.log(`✅ Duration received: ${duration}`);

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
        res.redirect(`/trips/${trip_id}/itinerary?date=${activity_date}`);
    });
});

// Update Itinerary Item (POST)
router.post('/:trip_id/itinerary/update/:activity_id', (req, res) => {
    const { trip_id, activity_id } = req.params;
    const { activity_type, activity_name, start_time, location, details } = req.body;
  
    const updateSql = `
      UPDATE itinerary 
      SET activity_type = ?, activity_name = ?, start_time = ?, location = ?, details = ?
      WHERE trip_id = ? AND activity_id = ?
    `;
  
    db.query(updateSql, [activity_type, activity_name, start_time, location, details, trip_id, activity_id], (err) => {
      if (err) {
        console.error("❌ Failed to update activity:", err);
        return res.status(500).send("❌ Failed to update activity.");
      }
  
      const redirectDate = req.query.date || new Date().toISOString().split('T')[0];
      res.redirect(`/trips/${trip_id}/itinerary?date=${redirectDate}`);
    });
  });

// 🗑️ Delete Activity (Form-based POST)
router.post('/:trip_id/itinerary/delete/:activity_id', (req, res) => {
    const { trip_id, activity_id } = req.params;
    const redirectDate = req.body.date;

    db.query("DELETE FROM itinerary WHERE trip_id = ? AND activity_id = ?", [trip_id, activity_id], (err) => {
        if (err) return res.status(500).send("❌ Failed to delete activity.");
        res.redirect(`/trips/${trip_id}/itinerary?date=${redirectDate}`);
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

// Route: Calendar View Itinerary
router.get('/:trip_id/calendar_itinerary', (req, res) => {
    const { trip_id } = req.params;
    const apiKey = process.env.GOOGLE_API_KEY;

    const tripSql = "SELECT * FROM trips WHERE trip_id = ?";
    const activitiesSql = "SELECT *, DATE_FORMAT(activity_date, '%Y-%m-%d') AS formatted_activity_date FROM itinerary WHERE trip_id = ? ORDER BY activity_date ASC";
    const details = activitiesSql.details;

    db.query(tripSql, [trip_id], (err, tripResult) => {
        if (err || tripResult.length === 0) {
            return res.status(404).send("Trip not found.");
        }
        const trip = tripResult[0];

        // Format trip dates
        const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        db.query(activitiesSql, [trip_id], (err, activitiesResult) => {
            if (err) return res.status(500).send("Failed to fetch activities.");

            // Ensure activity dates are correctly formatted
            activitiesResult.forEach(activity => {
                activity.formatted_activity_date = activity.formatted_activity_date; // Ensures consistent format
            });

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
        });
    });
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

// ✍️ Route to Add a Booking (With File Upload Support)
router.post('/:trip_id/bookings/add', upload.single('bookingFile'), (req, res) => {
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

    db.query(sql, [trip_id, accommodation_type, vendor_name, start_date, end_date, location, start_location, end_location, booking_link, file_name, original_name], (err) => {
        if (err) {
            console.error("❌ Error adding booking:", err);
            return res.status(500).send("Error adding booking.");
        }
        res.redirect(`/trips/${trip_id}/bookings`);
    });
});

// Retrieve bookings for a trip
router.get('/:trip_id/bookings', (req, res) => {
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

    // First, fetch trip
    db.query(tripQuery, [trip_id], (err, tripResults) => {
        if (err || tripResults.length === 0) {
            return res.status(404).send("Trip not found.");
        }

        const trip = tripResults[0];

        // Format trip dates
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        // Now fetch bookings
        db.query(bookingsQuery, [trip_id], (err, bookings) => {
            if (err) return res.status(500).send("Failed to retrieve bookings.");
            const safeEndDate = bookings.end_date && bookings.end_date.trim() !== '' ? bookings.end_date : null;

            res.render('pages/bookings', { trip, bookings, safeEndDate, apiKey: process.env.GOOGLE_API_KEY, edit });
        });
    });
});

// Update booking entry
router.post('/:trip_id/bookings/update/:booking_id', (req, res) => {
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

    db.query(updateSql, [accommodation_type, vendor_name, start_date, end_date, booking_id, trip_id], (err) => {
        if (err) {
            console.error("❌ Failed to update booking:", err);
            return res.status(500).send("Failed to update booking.");
        }
        res.redirect(`/trips/${trip_id}/bookings`);
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

    let sql = "SELECT * FROM trips WHERE user_id = ? AND end_date <= ? ORDER BY start_date ASC";
    db.query(sql, [userId, today], (err, results) => {
        if (err) {
            console.error("❌ Error fetching trips:", err);
            return res.status(500).send("Failed to retrieve past trips.");
        }
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

//route to unscheduled trips
router.get('/shared', (req, res) => {
    const userId = req.session.user?.id || 1;  // 👈 Hardcoded fallback for testing
    const today = new Date().toISOString().split('T')[0];

    console.log("🔎 Debug - userId:", userId);
    console.log("🔎 Debug - today:", today);

    let sql = "SELECT * FROM trips t join trip_users s on s.trip_id = t.trip_id WHERE s.user_id = ? AND s.role != 'owner' ORDER BY trip_name ASC";
    db.query(sql, [userId, today], (err, results) => {
        if (err) {
            console.error("❌ Error fetching trips:", err);
            return res.status(500).send("Failed to retrieve shared trips.");
        }
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
    });
});


// Route to show the trip dashboard
// This route will display the trip details and map
router.get('/:trip_id', (req, res) => {
    const tripId = req.params.trip_id;

    const tripSql = "SELECT * FROM trips WHERE trip_id = ?";
    const sharedUsersSql = `
        SELECT distinct users.user_id, users.email, trip_users.role 
        FROM trip_users
        JOIN users ON trip_users.user_id = users.user_id
        WHERE trip_users.trip_id = ?
    `;

    db.query(tripSql, [tripId], (err, tripResults) => {
        if (err || tripResults.length === 0) {
            console.error("❌ Error fetching trip:", err);
            return res.status(404).send("Trip not found.");
        }

        let trip = tripResults[0];

        // Format dates
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        trip.formattedStartDate = new Date(trip.start_date).toLocaleDateString('en-US', options);
        trip.formattedEndDate = new Date(trip.end_date).toLocaleDateString('en-US', options);

        db.query(sharedUsersSql, [tripId], (err, sharedUsers) => {
            if (err) {
                console.error("❌ Error fetching shared users:", err);
                return res.status(500).send("Failed to retrieve shared users.");
            }

            res.render('pages/trip_dashboard', {
                trip,
                sharedUsers,  // ✅ Pass shared users to the EJS file
                apiKey: process.env.GOOGLE_API_KEY
            });
        });
    });
});




module.exports = router;