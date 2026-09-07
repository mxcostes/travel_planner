require('dotenv').config(); // Load environment variables
const express = require('express');
const path = require('path');
const methodOverride = require('method-override');
const bodyParser = require('body-parser');
const session = require('express-session');
const db = require('./config/db');

const MySQLStore = require('express-mysql-session')(session);

const app = express();
const PORT = process.env.PORT || 3307;

// Railway (and most PaaS hosts) terminate TLS at a proxy in front of the app,
// so Express needs this to know the original request was HTTPS.
app.set('trust proxy', 1);

const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  app.use(session({
    key: 'kosmos_sid',
    secret: process.env.SESSION_SECRET || 'some_default_secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24
    }
  }));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));


// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


const tripsRoutes = require('./routes/trips'); // Routes for trips
const authRoutes = require('./routes/auth');





// Set up session (for authentication)
// app.use(session({
//     secret: 'your_secret_key',
//     resave: false,
//     saveUninitialized: true,
//     cookie: { secure: false } // Change to `true` in production with HTTPS
// }));

// Middleware to make GOOGLE_API_KEY available in all views
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// User Info Middleware
// ✅ Middleware to make user available globally in all EJS views
app.use((req, res, next) => {
    res.locals.user = req.session.user || { username: "Guest" };
    next();
});

// Routes
app.use('/trips', tripsRoutes);
app.use('/auth', authRoutes);

// Homepage Route
app.get('/', async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.redirect('/auth/login'); // Ensure the user is logged in
    }

    const userId = req.session.user.id;
    const today = new Date().toISOString().split('T')[0]; // 🔥 Ensures YYYY-MM-DD format

    const tripsSql = `
        SELECT t.*, s.role,
        DATE_FORMAT(t.start_date, '%Y-%m-%d') AS formatted_start_date,
        DATE_FORMAT(t.end_date, '%Y-%m-%d') AS formatted_end_date
        FROM trips t
        JOIN trip_users s ON t.trip_id = s.trip_id
        WHERE s.user_id = ?  --  Ensures we fetch both owned & shared trips
        ORDER BY t.start_date ASC
    `;

    try {
        const [trips] = await db.query(tripsSql, [userId]);

        const pastTrips = [];
        const upcomingTrips = [];
        const unscheduledTrips = [];
        const sharedTrips = [];
        let nextTrip = null;

        const seenTripIds = new Set(); // 🔹 Prevent duplicates in non-shared lists

        trips.forEach(trip => {
            const startDate = trip.formatted_start_date;
            const endDate = trip.formatted_end_date;
            const isShared = trip.role && trip.role !== 'owner'; // ✅ Only trips where user is NOT the owner are shared

            if (isShared) {
                sharedTrips.push(trip); // ✅ Always push shared trips
            } else if (!seenTripIds.has(trip.trip_id)) {
                // ✅ Avoid duplicate entries for owned trips
                seenTripIds.add(trip.trip_id);

                if (!startDate || !endDate) {
                    unscheduledTrips.push(trip);
                } else if (endDate < today) {
                    pastTrips.push(trip);
                } else if (endDate >= today) {
                    upcomingTrips.push(trip); // ✅ Push first, then assign nextTrip
                    if (!nextTrip) {
                        nextTrip = trip; // ✅ Now nextTrip is guaranteed to be in upcomingTrips
                    }
                }
            }
        });

        // 🔹 Console log trip names within each bucket
        console.log("\n📌 Past Trips:");
        pastTrips.forEach(trip => console.log(`   - ${trip.trip_name}`));

        console.log("\n📌 Upcoming Trips:");
        upcomingTrips.forEach(trip => console.log(`   - ${trip.trip_name}`));

        console.log("\n📌 Unscheduled Trips:");
        unscheduledTrips.forEach(trip => console.log(`   - ${trip.trip_name}`));

        console.log("\n📌 Shared Trips:");
        sharedTrips.forEach(trip => console.log(`   - ${trip.trip_name}`));

        res.render('pages/dashboard', {
            user: req.session.user,
            trips: { pastTrips, upcomingTrips, unscheduledTrips, sharedTrips },
            nextTrip
        });
    } catch (err) {
        console.error("❌ Failed to fetch trips:", err);
        res.status(500).send("Database error fetching trips.");
    }
});

// Dashboard Route - consider deleting
app.get('/dashboard', async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.redirect('/auth/login'); // Ensure the user is logged in
    }

    const userId = req.session.user.id;
    const today = new Date().toISOString().split('T')[0]; // 🔥 Ensures YYYY-MM-DD format

    const tripsSql = `
        SELECT distinct t.*,
        DATE_FORMAT(start_date, '%Y-%m-%d') AS formatted_start_date,
        DATE_FORMAT(end_date, '%Y-%m-%d') AS formatted_end_date
         FROM trips t
        join trip_users  s
        on t.trip_id = s.trip_id
        WHERE t.user_id = ?
        ORDER BY start_date ASC
    `;

    try {
        const [trips] = await db.query(tripsSql, [userId]);

        const pastTrips = [];
        const upcomingTrips = [];
        const unscheduledTrips = [];
        const sharedTrips = [];
        let nextTrip = null;

        trips.forEach(trip => {
            const startDate = trip.formatted_start_date;
            const endDate = trip.formatted_end_date;

            if (!startDate || !endDate) {
                unscheduledTrips.push(trip);
            } else if (endDate < today) {
                pastTrips.push(trip);
            } else {
                upcomingTrips.push(trip);
                if (!nextTrip) nextTrip = trip; // Assign first upcoming trip
            }
        });

        res.render('pages/dashboard', {
            user: req.session.user,
            trips: { pastTrips, upcomingTrips, unscheduledTrips, sharedTrips },
            nextTrip
        });
    } catch (err) {
        console.error("❌ Failed to fetch trips:", err);
        res.status(500).send("Database error fetching trips.");
    }
});

//create trip route
app.get('/trip_add', (req, res) => {
    res.render('pages/trip_add', { 
        user: req.session.user || { username: "Guest" } ,
        apiKey: process.env.GOOGLE_API_KEY  // Pass API key to EJS
    });
});

// Start the Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});


