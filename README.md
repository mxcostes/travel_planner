# Kosmos: Travel Planning Made Simple

Kosmos is a web-based travel planning tool designed to reduce the stress of organizing trips. Whether you're preparing for a solo getaway or coordinating with a group, Kosmos gives travelers a single platform to manage all aspects of trip planning—from budgeting and booking to building itineraries and packing. The app provides a streamlined interface for planning your journey, keeping everything you need in one accessible place.

---

## 🌎 Features

- **Trip Creation & Sharing**: Create and manage trips, with the ability to share and collaborate with other users.
- **Itinerary Builder**: Schedule activities by date, time, and duration with category tags and drive time estimation.
- **Packing Lists**: Add, update, and remove items to ensure nothing gets left behind.
- **Expense Tracker**: Record and categorize travel-related expenses to monitor your budget.
- **Booking Manager**:
  - Store and view travel-related bookings.
  - Upload booking PDFs for easy access.
  - Include links, vendors, locations, and dates.
- **Drive Time Estimator**: Calculate travel time between locations using Google Maps API.
- **User Authentication**: Register, log in, and manage trips securely.

---

## 📄 Tech Stack

- **Frontend**: EJS Templates, Bootstrap 5
- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **File Uploads**: Multer
- **API Integration**: Google Places & Maps API

---

## ⚙️ Installation & Setup

1. Clone the repository:

```bash
git clone https://github.com/mxcostes/travel_planner
cd kosmos
```

2. Install dependencies:

```bash
npm install
```

3. Set up your `.env` file:

```env
DB_HOST=localhost
DB_USER=youruser
DB_PASSWORD=yourpassword
DB_NAME=kosmos
GOOGLE_API_KEY=your_google_api_key
SESSION_SECRET=your_secret
```

4. Start the app locally:

```bash
nodemon app.js
```

> Make sure your MySQL database is running and matches the schema structure used in the app.

---

## 🔄 Usage

1. Register or log in.
2. Create a new trip by entering your destination, start date, and end date.
3. Add itinerary activities for each day (location, type, start time, duration).
4. Upload bookings and attach PDFs or links.
5. Create a packing list to stay organized.
6. Track expenses and monitor your travel budget.
7. Share your trip with others to collaborate and plan together.

---

## 🚀 Deployment

The application is currently intended for local use during development. Deployment options such as Render or Heroku will be evaluated during the final stages to allow public hosting.

---

## 🔐 Authentication

Users must create an account and log in to access full functionality, including saving and managing trips. Guest access is not currently supported.

---

## 👥 Contributors

- **Max Costes**\
  [GitHub Profile](https://github.com/your-username) *(replace with actual link if desired)*

---

## 📅 License

This project is licensed under the **MIT License**. See `LIC ENSE` for details.

---

## 🌟 Screenshots

*Coming soon: Include a few screenshots of the dashboard, itinerary view, and forms for better preview.*

---

## ❓ Questions or Feedback

Please open an issue or submit a pull request if you'd like to contribute or report a bug. Happy travels!

---

