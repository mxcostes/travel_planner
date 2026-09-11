const anthropic = require('../config/anthropic');

const EXTRACTION_TOOL = {
    name: 'extract_trip_document',
    description: 'Extract structured trip information from a travel booking document such as a hotel confirmation, flight itinerary, car rental agreement, or train/bus ticket.',
    input_schema: {
        type: 'object',
        properties: {
            booking: {
                type: 'object',
                description: 'The primary reservation this document confirms.',
                properties: {
                    accommodation_type: {
                        type: 'string',
                        enum: ['Transportation', 'Lodging', 'Activity', 'Food'],
                        description: 'Transportation covers flights, trains, buses, and car rentals. Lodging covers hotels and other stays.'
                    },
                    vendor_name: { type: 'string', description: 'Airline, hotel, rental company, or restaurant name' },
                    start_date: { type: 'string', description: 'YYYY-MM-DD check-in/departure date' },
                    end_date: { type: ['string', 'null'], description: 'YYYY-MM-DD check-out/return date, null if one-way or not applicable' },
                    location: { type: ['string', 'null'], description: 'Primary location, e.g. hotel address or airport' },
                    start_location: { type: ['string', 'null'] },
                    end_location: { type: ['string', 'null'] },
                    confirmation_number: { type: ['string', 'null'] },
                    booking_link: { type: ['string', 'null'], description: 'A URL to manage the booking, if present in the document' }
                },
                required: ['accommodation_type', 'vendor_name', 'start_date']
            },
            itinerary_segments: {
                type: 'array',
                description: 'Individual dated legs/activities described in the document (e.g. each flight leg), offered to the user afterward to add to their itinerary.',
                items: {
                    type: 'object',
                    properties: {
                        activity_type: { type: 'string', enum: ['Travel', 'Activity', 'Food'] },
                        activity_name: { type: 'string' },
                        activity_date: { type: 'string', description: 'YYYY-MM-DD' },
                        start_time: { type: ['string', 'null'], description: 'HH:MM 24-hour' },
                        location: { type: ['string', 'null'] },
                        details: { type: ['string', 'null'] }
                    },
                    required: ['activity_type', 'activity_name', 'activity_date']
                }
            },
            expense_items: {
                type: 'array',
                description: 'Individual cost line-items broken out in the document, offered to the user afterward to add to their expenses.',
                items: {
                    type: 'object',
                    properties: {
                        category: { type: 'string', enum: ['Transportation', 'Lodging', 'Food', 'Activities', 'Miscellaneous'] },
                        amount: { type: 'number' },
                        description: { type: ['string', 'null'] },
                        expense_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' }
                    },
                    required: ['category', 'amount']
                }
            }
        },
        required: ['booking']
    }
};

async function runExtraction(content) {
    const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: 2048,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: 'extract_trip_document' },
        messages: [{ role: 'user', content }]
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse) {
        throw new Error('Extraction did not return structured data');
    }
    return normalizeExtraction(toolUse.input);
}

async function extractBookingFromPdf(pdfBuffer) {
    return runExtraction([
        {
            type: 'document',
            source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBuffer.toString('base64')
            }
        },
        {
            type: 'text',
            text: 'Extract the booking, itinerary, and expense information from this travel document. If a field is not present, omit it or use null rather than guessing.'
        }
    ]);
}

// Forwarded emails don't always include a PDF - the confirmation is often
// just in the email body itself.
async function extractBookingFromText(emailText) {
    return runExtraction([
        {
            type: 'text',
            text: `Extract the booking, itinerary, and expense information from this forwarded email. If a field is not present, omit it or use null rather than guessing.\n\n---\n\n${emailText}`
        }
    ]);
}

// The model doesn't reliably return { booking, itinerary_segments,
// expense_items } at the top level as declared - it sometimes wraps the
// whole thing in an extra, unpredictably-named key, occasionally without
// even nesting a "booking" key inside that wrapper. Rather than guess at
// wrapper names, search the returned tree for objects/arrays that have the
// actual leaf fields we care about.
function findObjectWithKeys(node, requiredKeys, depth = 0) {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > 4) {
        return null;
    }
    if (requiredKeys.every((key) => key in node)) {
        return node;
    }
    for (const value of Object.values(node)) {
        const found = findObjectWithKeys(value, requiredKeys, depth + 1);
        if (found) return found;
    }
    return null;
}

function findArrayOfShape(node, requiredKeys, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 4) {
        return null;
    }
    if (Array.isArray(node) && node.length > 0 && requiredKeys.every((key) => key in node[0])) {
        return node;
    }
    for (const value of Object.values(node)) {
        const found = findArrayOfShape(value, requiredKeys, depth + 1);
        if (found) return found;
    }
    return null;
}

function normalizeExtraction(raw) {
    const booking = findObjectWithKeys(raw, ['accommodation_type', 'vendor_name']) || {};
    const itinerary_segments = findArrayOfShape(raw, ['activity_type', 'activity_date']) || [];
    const expense_items = findArrayOfShape(raw, ['category', 'amount']) || [];
    return { booking, itinerary_segments, expense_items };
}

module.exports = { extractBookingFromPdf, extractBookingFromText };
