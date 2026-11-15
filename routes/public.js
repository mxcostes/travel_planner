const express = require('express');
const router = express.Router();

const UPDATED = 'November 15, 2026';

router.get('/privacy', (req, res) => res.render('public/privacy', { updated: UPDATED }));
router.get('/terms', (req, res) => res.render('public/terms', { updated: UPDATED }));
router.get('/affiliate-disclosure', (req, res) => res.render('public/affiliate_disclosure', { updated: UPDATED }));
router.get('/contact', (req, res) => res.render('public/contact', { contactEmail: process.env.CONTACT_EMAIL || null }));
router.get('/guides', (req, res) => res.render('public/guides'));
router.get('/guides/packing-list', (req, res) => res.render('public/guide_packing', { updated: UPDATED }));

module.exports = router;
