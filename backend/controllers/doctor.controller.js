const { pool } = require("../config/db");
// =====================================================
// HELPER: LẤY USER ĐANG ĐĂNG NHẬP
// =====================================================

function getCurrentUser(req) {
    return (
        req.session?.user ||
        req.user ||
        null
    );
}
// =====================================================
// HELPER: LẤY DOCTOR ID TỪ USER
// =====================================================

async function getDoctorIdFromUser(user) {
    if (!user?.id) {
        return null;
    }
    const [rows] =
        await pool.query(
            `
            SELECT id
            FROM doctors
            WHERE user_id = ?
            LIMIT 1
            `,
            [user.id]
        );
    if (rows.length === 0) {
        return null;
    }
    return rows[0].id;
}
// =====================================================
// 1. LẤY DANH SÁCH BÁC SĨ
// GET /api/doctors
// =====================================================

async function getDoctors(req, res) {
    try {
        const [doctors] =
            await pool.query(
                `
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
                ORDER BY
                    u.full_name ASC
                `
            );
        return res.status(200).json({
            success: true,
            data: doctors
        });
    } catch (error) {
        console.error(
            "GET DOCTORS ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy danh sách bác sĩ."
        });
    }
}
// =====================================================
// 2. LẤY CHI TIẾT BÁC SĨ
// GET /api/doctors/:id
// =====================================================

async function getDoctorById(
    req,
    res
) {
    try {
        const doctorId =
            Number(
                req.params.id
            );
        if (
            !doctorId ||
            doctorId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "ID bác sĩ không hợp lệ."
            });
        }
        const [doctors] =
            await pool.query(
                `
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
                `,
                [doctorId]
            );
        if (
            doctors.length === 0
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy bác sĩ."
            });
        }
        return res.status(200).json({
            success: true,
            data: doctors[0]
        });
    } catch (error) {
        console.error(
            "GET DOCTOR ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy thông tin bác sĩ."
        });
    }
}
// =====================================================
// 3. LẤY LỊCH CÔNG KHAI CỦA BÁC SĨ
// GET /api/doctors/:id/schedules
// =====================================================

async function getDoctorSchedules(
    req,
    res
) {
    try {
        const doctorId =
            Number(
                req.params.id
            );
        if (
            !doctorId ||
            doctorId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "ID bác sĩ không hợp lệ."
            });
        }
        const [schedules] =
            await pool.query(
                `
                SELECT
                    id,
                    doctor_id,
                    schedule_date,
                    shift_type,
                    start_time,
                    end_time,
                    status
                FROM schedules
                WHERE doctor_id = ?
                  AND schedule_date >= CURDATE()
                ORDER BY
                    schedule_date ASC,
                    start_time ASC
                `,
                [doctorId]
            );
        return res.status(200).json({
            success: true,
            data: schedules
        });
    } catch (error) {
        console.error(
            "GET DOCTOR SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy lịch khám của bác sĩ."
        });
    }
}
// =====================================================
// 4. DASHBOARD BÁC SĨ
// GET /api/doctors/me/dashboard
// =====================================================

async function getDoctorDashboard(
    req,
    res
) {
    try {
        const user =
            getCurrentUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "Bạn chưa đăng nhập."
            });
        }
        if (
            user.role !== "DOCTOR"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền truy cập dashboard bác sĩ."
            });
        }
        const doctorId =
            await getDoctorIdFromUser(
                user
            );
        if (!doctorId) {
            return res.status(404).json({
                success: false,
                message:
                    "Tài khoản chưa được liên kết với hồ sơ bác sĩ."
            });
        }
        // =================================================
        // THÔNG TIN BÁC SĨ
        // =================================================
        const [doctorRows] =
            await pool.query(
                `
                SELECT
                    d.id,
                    u.full_name,
                    u.email,
                    u.phone,
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
                LEFT JOIN specialties s
                    ON d.specialty_id = s.id
                WHERE d.id = ?
                LIMIT 1
                `,
                [doctorId]
            );
        if (
            doctorRows.length === 0
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy hồ sơ bác sĩ."
            });
        }
        // =================================================
        // THỐNG KÊ
        // =================================================
        const [todayRows] =
            await pool.query(
                `
                SELECT COUNT(*) AS total
                FROM schedules
                WHERE doctor_id = ?
                  AND schedule_date = CURDATE()
                  AND status = 'AVAILABLE'
                `,
                [doctorId]
            );
        const [appointmentRows] =
            await pool.query(
                `
                SELECT COUNT(*) AS total
                FROM appointments
                WHERE doctor_id = ?
                  AND status <> 'CANCELLED'
                `,
                [doctorId]
            );
        const [pendingRows] =
            await pool.query(
                `
                SELECT COUNT(*) AS total
                FROM appointments
                WHERE doctor_id = ?
                  AND status = 'PENDING'
                `,
                [doctorId]
            );
        const [completedRows] =
            await pool.query(
                `
                SELECT COUNT(*) AS total
                FROM appointments
                WHERE doctor_id = ?
                  AND status = 'COMPLETED'
                `,
                [doctorId]
            );
        return res.json({
            success: true,
            data: {
                doctor:
                    doctorRows[0],
                statistics: {
                    todaySchedules:
                        Number(
                            todayRows[0].total
                        ),
                    appointments:
                        Number(
                            appointmentRows[0].total
                        ),
                    pending:
                        Number(
                            pendingRows[0].total
                        ),
                    completed:
                        Number(
                            completedRows[0].total
                        )
                }
            }
        });
    } catch (error) {
        console.error(
            "GET DOCTOR DASHBOARD ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể tải dashboard bác sĩ."
        });
    }
}
// =====================================================
// 5. LẤY LỊCH HẸN CỦA BÁC SĨ
// GET /api/doctors/me/appointments
// =====================================================

async function getDoctorAppointments(
    req,
    res
) {
    try {
        const user =
            getCurrentUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "Bạn chưa đăng nhập."
            });
        }
        if (
            user.role !== "DOCTOR"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền xem lịch hẹn bác sĩ."
            });
        }
        const doctorId =
            await getDoctorIdFromUser(
                user
            );
        if (!doctorId) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy hồ sơ bác sĩ."
            });
        }
        const [appointments] =
            await pool.query(
                `
                SELECT
                    a.id,
                    a.patient_id,
                    a.doctor_id,
                    a.schedule_id,
                    a.appointment_time,
                    a.reason,
                    a.status,
                    a.actual_arrival_time,
                    a.late_minutes,
                    a.note,
                    s.schedule_date,
                    s.shift_type,
                    s.start_time,
                    s.end_time,
                    u.full_name AS patient_name,
                    u.phone AS patient_phone,
                    u.email AS patient_email
                FROM appointments a
                INNER JOIN schedules s
                    ON a.schedule_id = s.id
                INNER JOIN users u
                    ON a.patient_id = u.id
                WHERE a.doctor_id = ?
                ORDER BY
                    s.schedule_date DESC,
                    a.appointment_time ASC
                `,
                [doctorId]
            );
        return res.json({
            success: true,
            data: appointments
        });
    } catch (error) {
        console.error(
            "GET DOCTOR APPOINTMENTS ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể tải lịch hẹn của bác sĩ."
        });
    }
}
// =====================================================
// 6. BÁC SĨ CẬP NHẬT TRẠNG THÁI LỊCH HẸN
//
// PATCH
// /api/doctors/me/appointments/:id/status
// =====================================================

async function updateDoctorAppointmentStatus(
    req,
    res
) {
    try {
        const user =
            getCurrentUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "Bạn chưa đăng nhập."
            });
        }
        if (
            user.role !== "DOCTOR"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền cập nhật lịch hẹn."
            });
        }
        const doctorId =
            await getDoctorIdFromUser(
                user
            );
        if (!doctorId) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy hồ sơ bác sĩ."
            });
        }
        const appointmentId =
            Number(
                req.params.id
            );
        if (
            !appointmentId ||
            appointmentId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch hẹn không hợp lệ."
            });
        }
        const {
            status
        } = req.body;
        const allowedStatuses = [
            "CONFIRMED",
            "CANCELLED",
            "COMPLETED",
            "NO_SHOW"
        ];
        if (
            !allowedStatuses.includes(
                status
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Trạng thái lịch hẹn không hợp lệ."
            });
        }
        // =================================================
        // LẤY LỊCH HẸN CỦA CHÍNH BÁC SĨ
        // =================================================
        const [rows] =
            await pool.query(
                `
                SELECT
                    id,
                    doctor_id,
                    status,
                    actual_arrival_time
                FROM appointments
                WHERE id = ?
                  AND doctor_id = ?
                LIMIT 1
                `,
                [
                    appointmentId,
                    doctorId
                ]
            );
        if (
            rows.length === 0
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lịch hẹn hoặc bạn không có quyền xử lý."
            });
        }
        const appointment =
            rows[0];
        // =================================================
        // KIỂM TRA LUỒNG TRẠNG THÁI
        // =================================================
        if (
            status === "CONFIRMED"
            &&
            appointment.status !== "PENDING"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch PENDING mới có thể xác nhận."
            });
        }
        if (
            status === "CANCELLED"
            &&
            (
                appointment.status !== "PENDING"
                &&
                appointment.status !== "CONFIRMED"
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Lịch hẹn hiện tại không thể hủy."
            });
        }
        if (
            status === "COMPLETED"
        ) {
            if (
                appointment.status !==
                "CONFIRMED"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Chỉ lịch CONFIRMED mới có thể hoàn thành."
                });
            }
            if (
                !appointment.actual_arrival_time
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Chưa ghi nhận bệnh nhân đến khám."
                });
            }
        }
        if (
            status === "NO_SHOW"
            &&
            appointment.status !==
            "CONFIRMED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch CONFIRMED mới có thể đánh dấu không đến."
            });
        }
        // =================================================
        // CẬP NHẬT
        // =================================================
        await pool.query(
            `
            UPDATE appointments
            SET
                status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND doctor_id = ?
            `,
            [
                status,
                appointmentId,
                doctorId
            ]
        );
        return res.json({
            success: true,
            message:
                "Cập nhật trạng thái lịch hẹn thành công."
        });
    } catch (error) {
        console.error(
            "UPDATE DOCTOR APPOINTMENT STATUS ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể cập nhật trạng thái lịch hẹn."
        });
    }
}
// =====================================================
// EXPORT
// =====================================================

module.exports = {
    getDoctors,
    getDoctorById,
    getDoctorSchedules,
    getDoctorDashboard,
    getDoctorAppointments,
    updateDoctorAppointmentStatus
};