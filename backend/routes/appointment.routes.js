const express = require("express");

const router = express.Router();

const appointmentController =
    require("../controllers/appointment.controller");

const prescriptionController =
    require("../controllers/prescription.controller");
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
// ĐỔI LỊCH KHÁM
// PATCH /api/appointments/:id/reschedule
// =====================================================

router.patch(
    "/appointments/:id/reschedule",
    appointmentController.rescheduleAppointment
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
// =====================================================
// BÁC SĨ HỦY LỊCH
// POST /api/appointments/:id/doctor-cancel
// Body: { "reason": "..." }
// =====================================================

router.post(
    "/appointments/:id/doctor-cancel",
    appointmentController.doctorCancelAppointment
);
// =====================================================
// BỆNH NHÂN ĐÁNH GIÁ BÁC SĨ
// POST /api/appointments/:id/review
// Body: { "rating": 5, "comment": "Bác sĩ tư vấn nhiệt tình" }
// =====================================================

router.post(
    "/appointments/:id/review",
    appointmentController.createAppointmentReview
);
// =====================================================
// BỆNH NHÂN SỬA ĐÁNH GIÁ (trong vòng 3 ngày sau khi khám)
// PUT /api/appointments/:id/review
// Body: { "rating": 4, "comment": "..." }
// =====================================================

router.put(
    "/appointments/:id/review",
    appointmentController.updateAppointmentReview
);
// =====================================================
// ĐƠN THUỐC
// GET  /api/appointments/:id/prescription  (bệnh nhân/bác sĩ/admin)
// POST /api/appointments/:id/prescription  (bác sĩ kê đơn mới)
// PUT  /api/appointments/:id/prescription  (bác sĩ sửa đơn)
// =====================================================

router.get(
    "/appointments/:id/prescription",
    prescriptionController.getAppointmentPrescription
);

// =====================================================
// TẤT CẢ ĐƠN THUỐC CỦA BỆNH NHÂN ĐANG ĐĂNG NHẬP (đầy đủ chi tiết)
// GET /api/prescriptions/my
// =====================================================

router.get(
    "/prescriptions/my",
    prescriptionController.getMyPrescriptions
);

router.post(
    "/appointments/:id/prescription",
    prescriptionController.createPrescription
);

router.put(
    "/appointments/:id/prescription",
    prescriptionController.updatePrescription
);

module.exports = router;