const { pool } = require("../config/db");

async function getDoctors(req, res) {
    try {
        const [doctors] = await pool.query(`
            SELECT
                d.id,
                u.full_name,
                u.email,
                u.phone,
                u.gender,
                d.specialty_id,
                s.name AS specialty_name,
                d.license_number,
                d.experience_years,
                d.qualification,
                d.introduction,
                d.avatar
            FROM doctors d
            INNER JOIN users u
                ON d.user_id = u.id
            INNER JOIN specialties s
                ON d.specialty_id = s.id
            ORDER BY u.full_name ASC
        `);

        return res.status(200).json({
            success: true,
            data: doctors
        });

    } catch (error) {
        console.error("GET DOCTORS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể lấy danh sách bác sĩ."
        });
    }
}


async function getDoctorById(req, res) {
    try {
        const doctorId = Number(req.params.id);

        if (!doctorId || doctorId <= 0) {
            return res.status(400).json({
                success: false,
                message: "ID bác sĩ không hợp lệ."
            });
        }

        const [doctors] = await pool.query(`
            SELECT
                d.id,
                u.full_name,
                u.email,
                u.phone,
                u.gender,
                d.specialty_id,
                s.name AS specialty_name,
                d.license_number,
                d.experience_years,
                d.qualification,
                d.introduction,
                d.avatar
            FROM doctors d
            INNER JOIN users u
                ON d.user_id = u.id
            INNER JOIN specialties s
                ON d.specialty_id = s.id
            WHERE d.id = ?
            LIMIT 1
        `, [doctorId]);

        if (doctors.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy bác sĩ."
            });
        }

        return res.status(200).json({
            success: true,
            data: doctors[0]
        });

    } catch (error) {
        console.error("GET DOCTOR ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể lấy thông tin bác sĩ."
        });
    }
}


async function getDoctorSchedules(req, res) {
    try {
        const doctorId = Number(req.params.id);

        if (!doctorId || doctorId <= 0) {
            return res.status(400).json({
                success: false,
                message: "ID bác sĩ không hợp lệ."
            });
        }

        const [schedules] = await pool.query(`
            SELECT
                id,
                doctor_id,
                schedule_date,
                start_time,
                end_time,
                status
            FROM schedules
            WHERE doctor_id = ?
              AND schedule_date >= CURDATE()
            ORDER BY schedule_date ASC, start_time ASC
        `, [doctorId]);

        return res.status(200).json({
            success: true,
            data: schedules
        });

    } catch (error) {
        console.error("GET DOCTOR SCHEDULE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể lấy lịch khám của bác sĩ."
        });
    }
}


module.exports = {
    getDoctors,
    getDoctorById,
    getDoctorSchedules
};