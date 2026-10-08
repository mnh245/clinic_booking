const express = require("express");
const path = require("path");
const session = require("express-session");

require("dotenv").config();

const { testConnection } = require("./config/db");

const authRoutes = require("./routes/auth.routes");
const doctorRoutes = require("./routes/doctor.routes");
const appointmentRoutes = require("./routes/appointment.routes");
const scheduleRoutes = require("./routes/schedule.routes");

const app = express();

const PORT = process.env.PORT || 3000;

const frontendPath = path.join(
    __dirname,
    "..",
    "frontend"
);
/*
=====================================================
BODY PARSER
=====================================================
*/

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);
/*
=====================================================
SESSION
=====================================================
*/

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "clinic_booking_secret_key",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: false,
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);
/*
=====================================================
API ROUTES
=====================================================
*/

app.use(
    "/api",
    authRoutes
);

app.use(
    "/api/doctors",
    doctorRoutes
);

app.use(
    "/api",
    scheduleRoutes
);

app.use(
    "/api",
    appointmentRoutes
);
/*
=====================================================
FRONTEND
=====================================================
*/

app.use(
    express.static(frontendPath)
);
/*
=====================================================
TRANG CHỦ
=====================================================
*/

app.get("/", (req, res) => {
    res.redirect("/login.html");
});
/*
=====================================================
API 404
=====================================================
*/

app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            success: false,
            message: "API không tồn tại."
        });
    }
    res.status(404).send(
        "Trang không tồn tại."
    );
});
/*
=====================================================
ERROR HANDLER
=====================================================
*/

app.use((error, req, res, next) => {
    console.error(
        "SERVER ERROR:",
        error
    );
    res.status(500).json({
        success: false,
        message: "Lỗi máy chủ."
    });
});
/*
=====================================================
START SERVER
=====================================================
*/

async function startServer() {
    try {
        await testConnection();
        app.listen(PORT, () => {
            console.log(
                `Server running at http://localhost:${PORT}`
            );
            console.log(
                `Login page: http://localhost:${PORT}/login.html`
            );
            console.log(
                `Register page: http://localhost:${PORT}/register.html`
            );
        });
    } catch (error) {
        console.error(
            "Server cannot start:",
            error.message
        );
        process.exit(1);
    }
}


startServer();