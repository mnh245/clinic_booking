const express = require("express");

const router = express.Router();

const {
    getDoctorSchedules,
    getDoctorScheduleByDate,
    createSchedule,
    closeSchedule
} = require("../controllers/schedule.controller");

/*
    Lấy toàn bộ lịch của bác sĩ
*/
router.get(
    "/doctors/:doctorId/schedules",
    getDoctorSchedules
);

/*
    Lấy lịch của bác sĩ theo ngày
*/
router.get(
    "/doctors/:doctorId/schedules/:date",
    getDoctorScheduleByDate
);
/*
    Tạo lịch làm việc
*/
router.post(
    "/schedules",
    createSchedule
);
/*
    Đóng lịch
*/
router.patch(
    "/schedules/:id/close",
    closeSchedule
);
module.exports = router;