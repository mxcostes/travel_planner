require('dotenv').config();

// Each builder returns null when its env var is unset, so views can skip
// rendering the placement entirely instead of emitting an untagged link.
function fromTemplate(template, destination) {
    if (!template) return null;
    return template.replace(/\{destination\}/g, encodeURIComponent(destination || ''));
}

module.exports = {
    amazonSearch(itemName) {
        const tag = process.env.AMAZON_ASSOCIATES_TAG;
        if (!tag || !itemName) return null;
        return `https://www.amazon.com/s?k=${encodeURIComponent(itemName)}&tag=${encodeURIComponent(tag)}`;
    },

    activities(destination) {
        return fromTemplate(process.env.ACTIVITIES_AFFILIATE_URL, destination);
    },

    insurance(destination) {
        return fromTemplate(process.env.INSURANCE_AFFILIATE_URL, destination);
    },

    carRental(destination) {
        return fromTemplate(process.env.CAR_RENTAL_AFFILIATE_URL, destination);
    }
};
