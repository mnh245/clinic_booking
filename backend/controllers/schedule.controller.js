const db = require("../config/db");
/*
    ============================================
    LẤY LỊCH LÀM VIỆC CỦA MỘT BÁC SĨ
    GET /api/doctors/:doctorId/schedules
    ============================================
*/
async function getDoctorSchedules(req, res) {
    try {
        const { doctorId } = req.params;
        const [rows] = await db.pool.query(
            `
            SELECT
                s.id,
                s.doctor_id,
                u.full_name AS doctor_name,
                s.schedule_date,
                s.start_time,
                s.end_time,
                s.status
            FROM schedules s
            JOIN doctors d
                ON s.doctor_id = d.id
            JOIN users u
                ON d.user_id = u.id
            WHERE s.doctor_id = ?
            ORDER BY s.schedule_date ASC, s.start_time ASC
            `,
            [doctorId]
        );
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error("GET SCHEDULE ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Không thể lấy lịch làm việc của bác sĩ."
        });
    }
}
/*
    ============================================
    LẤY LỊCH CỦA BÁC SĨ THEO NGÀY
    GET /api/doctors/:doctorId/schedules/:date
    ============================================
*/
async function getDoctorScheduleByDate(req, res) {
    try {
        const { doctorId, date } = req.params;
        const [rows] = await db.pool.query(
            `
            SELECT
                s.id,
                s.doctor_id,
                u.full_name AS doctor_name,
                s.schedule_date,
                s.start_time,
                s.end_time,
                s.status
            FROM schedules s
            JOIN doctors d
                ON s.doctor_id = d.id
            JOIN users u
                ON d.user_id = u.id
            WHERE s.doctor_id = ?
              AND s.schedule_date = ?
            ORDER BY s.start_time ASC
            `,
            [doctorId, date]
        );
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error("GET SCHEDULE BY DATE ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Không thể lấy lịch khám."
        });
    }
}
/*
    ============================================
    TẠO LỊCH LÀM VIỆC CHO BÁC SĨ
    POST /api/schedules
    ============================================
*/
async function createSchedule(req, res) {
    try {
        const {
            doctor_id,
            schedule_date,
            start_time,
            end_time
        } = req.body;
        if (
            !doctor_id ||
            !schedule_date ||
            !start_time ||
            !end_time
        ) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập đầy đủ thông tin lịch."
            });
        }
        /*
            Kiểm tra bác sĩ tồn tại
        */
        const [doctor] = await db.pool.query(
            `
            SELECT id
            FROM doctors
            WHERE id = ?
            LIMIT 1
            `,
            [doctor_id]
        );
        if (doctor.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy bác sĩ."
            });
        }
        /*
            Kiểm tra thời gian
        */
        if (start_time >= end_time) {
            return res.status(400).json({
                success: false,
                message: "Giờ bắt đầu phải nhỏ hơn giờ kết thúc."
            });
        }
        /*
            Kiểm tra lịch bị trùng
        */
        const [existing] = await db.pool.query(
            `
            SELECT id
            FROM schedules
            WHERE doctor_id = ?
              AND schedule_date = ?
              AND status = 'AVAILABLE'
              AND start_time < ?
              AND end_time > ?
            LIMIT 1
            `,
            [
                doctor_id,
                schedule_date,
                end_time,
                start_time
            ]
        );
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Lịch làm việc bị trùng với lịch đã tồn tại."
            });
        }
        /*
            Tạo lịch
        */
        const [result] = await db.pool.query(
            `
            INSERT INTO schedules
            (
                doctor_id,
                schedule_date,
                start_time,
                end_time,
                status
            )
            VALUES (?, ?, ?, ?, 'AVAILABLE')
            `,
            [
                doctor_id,
                schedule_date,
                start_time,
                end_time
            ]
        );
        res.status(201).json({
            success: true,
            message: "Tạo lịch làm việc thành công.",
            data: {
                id: result.insertId,
                doctor_id,
                schedule_date,
                start_time,
                end_time,
                status: "AVAILABLE"
            }
        });
    } catch (error) {
        console.error("CREATE SCHEDULE ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Không thể tạo lịch làm việc."
        });
    }
}
/*
    ============================================
    ĐÓNG LỊCH
    PATCH /api/schedules/:id/close
    ============================================
*/
async function closeSchedule(req, res) {
    try {
        const { id } = req.params;
        const [result] = await db.pool.query(
            `
            UPDATE schedules
            SET status = 'CLOSED'
            WHERE id = ?
            `,
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy lịch."
            });
        }
        res.json({
            success: true,
            message: "Đã đóng lịch khám."
        });
    } catch (error) {
        console.error("CLOSE SCHEDULE ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Không thể đóng lịch."
        });
    }
}
module.exports = {
    getDoctorSchedules,
    getDoctorScheduleByDate,
    createSchedule,
    closeSchedule
};