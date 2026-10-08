const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth.controller");
// ================================
// ĐĂNG KÝ
// ================================
router.post(
    "/register",
    authController.register
);
// ================================
// ĐĂNG NHẬP
// ================================
router.post(
    "/login",
    authController.login
);
// ================================
// ĐĂNG XUẤT
// ================================
router.post(
    "/logout",
    authController.logout
);
// ================================
// KIỂM TRA SESSION
// ================================
router.get("/session", (req, res) => {
    console.log("======================================");
    console.log("CHECK SESSION");
    console.log("Session ID:", req.sessionID);
    console.log("Session:", req.session);
    console.log("Cookie:", req.headers.cookie);
    console.log("User:", req.session?.user);
    console.log("======================================");
    if (!req.session?.user) {
        return res.status(401).json({
            success: false,
            message: "Chưa có session user.",
            sessionID: req.sessionID,
            user: null
        });
    }
    return res.status(200).json({
        success: true,
        message: "Session đang tồn tại.",
        sessionID: req.sessionID,
        user: req.session.user
    });
});


module.exports = router;