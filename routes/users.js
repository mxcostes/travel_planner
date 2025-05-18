const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { db } = require('../config/db'); // use promise-based export

// Render Sign Up Page
router.get('/signup', (req, res) => {
    res.render('auth/signup');
});

// Handle Sign Up Form Submission
router.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.render('auth/signup', { error: "All fields are required." });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)";
        await db.query(sql, [username, email, hashedPassword]);
        
        res.redirect('/auth/login');
    } catch (err) {
        console.error(err);
        res.render('auth/signup', { error: "User registration failed. Try again." });
    }
});

// Render Login Page
router.get('/login', (req, res) => {
    res.render('auth/login');
});

// Handle Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('auth/login', { error: "All fields are required." });
    }

    try {
        const sql = "SELECT * FROM users WHERE email = ?";
        const [results] = await db.query(sql, [email]);

        if (results.length === 0) {
            return res.render('auth/login', { error: "Invalid email or password." });
        }

        const user = results[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.render('auth/login', { error: "Invalid email or password." });
        }

        req.session.user = { id: user.user_id, username: user.username };
        console.log("✅ Logged in user:", req.session.user);
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.render('auth/login', { error: "Login failed. Try again." });
    }
});

// Handle Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/auth/login');
    });
});

module.exports = router;