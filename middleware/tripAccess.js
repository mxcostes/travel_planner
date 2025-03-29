const db = require('../config/db');

function checkTripAccess(requiredRole) {
    return (req, res, next) => {
        const { trip_id } = req.params;
        const userId = req.session.user?.id;

        if (!userId) {
            return res.status(401).send("Unauthorized: Please log in.");
        }

        const sql = "SELECT role FROM trip_users WHERE trip_id = ? AND user_id = ?";
        
        db.query(sql, [trip_id, userId], (err, results) => {
            if (err) {
                console.error("❌ Database error:", err);
                return res.status(500).send("Database error.");
            }

            if (results.length === 0) {
                return res.status(403).send("Access denied: You are not a participant in this trip.");
            }

            const userRole = results[0].role;
            const roleHierarchy = { viewer: 1, editor: 2, owner: 3 };

            if (roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
                return res.status(403).send("Access denied: Insufficient permissions.");
            }

            next();
        });
    };
}

module.exports = checkTripAccess;