const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');

// Render Sign Up Page
router.get('/signup', (req, res) => {
    res.render('auth/signup', {error: null});
});

// Handle Sign Up Form Submission
router.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.render('auth/signup', { error: "All fields are required." });
    }

    try {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user into the database
        let sql = "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)";
        db.query(sql, [username, email, hashedPassword], (err, result) => {
            if (err) {
                console.error(err);
                return res.render('auth/signup', { error: "User registration failed. Try again." });
            }
            res.redirect('/auth/login');
        });
    } catch (error) {
        console.error(error);
        res.render('auth/signup', { error: "An error occurred. Please try again." });
    }
});

// Render Login Page
router.get('/login', (req, res) => {
    res.render('auth/login', {error: null});
});

// Handle Login
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('auth/login', { error: "All fields are required." });
    }

    let sql = "SELECT * FROM users WHERE email = ?";
    db.query(sql, [email], async (err, results) => {
        if (err) {
            console.error(err);
            return res.render('auth/login', { error: "Login failed. Try again." });
        }

        if (results.length === 0) {
            return res.render('auth/login', { error: "Invalid email or password." });
        }

        const user = results[0];

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.render('auth/login', { error: "Invalid email or password." });
        }

        req.session.user = { id: user.user_id, username: user.username };
        res.redirect('/');
    });
});

// Handle Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/auth/login');
    });
});

module.exports = router;