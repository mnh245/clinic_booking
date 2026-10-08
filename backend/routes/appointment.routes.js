const express = require("express");

const router = express.Router();

const appointmentController =
    require("../controllers/appointment.controller");
// =====================================================
// GIỜ KHÁM CÒN TRỐNG
// GET /api/doctors/:doctorId/available-slots?date=YYYY-MM-DD
// =====================================================

router.get(
    "/doctors/:doctorId/available-slots",
    appointmentController.getAvailableSlots
);
// =====================================================
// TẠO LỊCH HẸN
// POST /api/appointments
// =====================================================

router.post(
    "/appointments",
    appointmentController.createAppointment
);
// =====================================================
// LẤY LỊCH KHÁM CỦA BỆNH NHÂN
// GET /api/patients/:patientId/appointments
// =====================================================

router.get(
    "/patients/:patientId/appointments",
    appointmentController.getPatientAppointments
);
// =====================================================
// HỦY LỊCH
// PATCH /api/appointments/:id/cancel
// =====================================================

router.patch(
    "/appointments/:id/cancel",
    appointmentController.cancelAppointment
);
// =====================================================
// BÁC SĨ XÁC NHẬN
// POST /api/appointments/:id/confirm
// =====================================================

router.post(
    "/appointments/:id/confirm",
    appointmentController.confirmAppointment
);
// =====================================================
// GHI NHẬN BỆNH NHÂN ĐẾN
// POST /api/appointments/:id/arrival
// =====================================================

router.post(
    "/appointments/:id/arrival",
    appointmentController.recordArrival
);
// =====================================================
// ĐÁNH DẤU KHÔNG ĐẾN
// POST /api/appointments/:id/no-show
// =====================================================

router.post(
    "/appointments/:id/no-show",
    appointmentController.markNoShow
);
// =====================================================
// HOÀN THÀNH
// POST /api/appointments/:id/complete
// =====================================================

router.post(
    "/appointments/:id/complete",
    appointmentController.completeAppointment
);


module.exports = router;