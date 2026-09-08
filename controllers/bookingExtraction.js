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
                description: 'Individual dated legs/activities described in the document (e.g. each flight leg). Captured for future use - not shown to the user yet.',
                items: {
                    type: 'object',
                    properties: {
                        activity_type: { type: 'string' },
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
                description: 'Individual cost line-items broken out in the document. Captured for future use - not shown to the user yet.',
                items: {
                    type: 'object',
                    properties: {
                        category: { type: 'string' },
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

async function extractBookingFromPdf(pdfBuffer) {
    const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: 2048,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: 'extract_trip_document' },
        messages: [{
            role: 'user',
            content: [
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
            ]
        }]
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse) {
        throw new Error('Extraction did not return structured data');
    }
    return toolUse.input;
}

module.exports = { extractBookingFromPdf };
