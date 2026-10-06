const express = require("express");

const router = express.Router();

const {
    getAvailableSlots,
    createAppointment,
    getPatientAppointments,
    cancelAppointment
} = require("../controllers/appointment.controller");


/*
    Lấy giờ khám còn trống
*/

router.get(
    "/doctors/:doctorId/available-slots",
    getAvailableSlots
);


/*
    Đặt lịch
*/

router.post(
    "/appointments",
    createAppointment
);


/*
    Lấy lịch của bệnh nhân
*/

router.get(
    "/patients/:patientId/appointments",
    getPatientAppointments
);


/*
    Hủy lịch
*/

router.patch(
    "/appointments/:id/cancel",
    cancelAppointment
);


module.exports = router;