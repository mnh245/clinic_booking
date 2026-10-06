const express = require("express");

const router = express.Router();

const {
    cancelAppointment,
    confirmAppointment,
    recordArrival,
    markNoShow,
    completeAppointment
} = require("../controllers/appointment.controller");


// Hủy lịch
router.post(
    "/:id/cancel",
    cancelAppointment
);


// Xác nhận lịch
router.post(
    "/:id/confirm",
    confirmAppointment
);


// Ghi nhận bệnh nhân đến
router.post(
    "/:id/arrival",
    recordArrival
);


// Đánh dấu không đến
router.post(
    "/:id/no-show",
    markNoShow
);


// Hoàn thành khám
router.post(
    "/:id/complete",
    completeAppointment
);


module.exports = router;