"use strict";

const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");

// Bác sĩ
router.get("/doctors", adminController.getDoctors);
router.post("/doctors", adminController.createDoctor);
router.put("/doctors/:id", adminController.updateDoctor);
router.delete("/doctors/:id", adminController.deleteDoctor);

// Chuyên khoa
router.get("/specialties", adminController.getSpecialties);
router.post("/specialties", adminController.createSpecialty);
router.put("/specialties/:id", adminController.updateSpecialty);
router.delete("/specialties/:id", adminController.deleteSpecialty);

// Báo cáo lịch khám
router.get(
    "/appointment-report",
    adminController.getAppointmentReport
);

module.exports = router;