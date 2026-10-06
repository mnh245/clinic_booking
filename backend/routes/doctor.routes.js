const express = require("express");

const router = express.Router();

const {
    getDoctors,
    getDoctorById,
    getDoctorSchedules
} = require("../controllers/doctor.controller");


router.get("/", getDoctors);

router.get("/:id", getDoctorById);

router.get("/:id/schedules", getDoctorSchedules);


module.exports = router;