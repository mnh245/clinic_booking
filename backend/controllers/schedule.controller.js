const { pool } = require("../config/db");
// =====================================================
// CẤU HÌNH 4 CA
// =====================================================

const SHIFT_CONFIG = {
    NIGHT: {
        name: "Ca đêm",
        displayStart: "00:00",
        displayEnd: "06:00",
        start_time: "00:00:00",
        end_time: "06:00:00"
    },
    MORNING: {
        name: "Ca sáng",
        displayStart: "06:00",
        displayEnd: "12:00",
        start_time: "06:00:00",
        end_time: "12:00:00"
    },
    AFTERNOON: {
        name: "Ca chiều",
        displayStart: "12:00",
        displayEnd: "18:00",
        start_time: "12:00:00",
        end_time: "18:00:00"
    },
    EVENING: {
        name: "Ca tối",
        displayStart: "18:00",
        displayEnd: "00:00",
        start_time: "18:00:00",
        end_time: "23:59:59"
    }
};
// =====================================================
// USER HIỆN TẠI
// =====================================================

function getCurrentUser(req) {
    return (
        req.session?.user ||
        req.user ||
        null
    );
}
// =====================================================
// LẤY DOCTOR ID TỪ USER
// =====================================================

async function getDoctorIdFromUser(user) {
    if (!user?.id) {
        return null;
    }
    const [rows] = await pool.query(
        `
        SELECT id
        FROM doctors
        WHERE user_id = ?
        LIMIT 1
        `,
        [user.id]
    );
    if (!rows.length) {
        return null;
    }
    return rows[0].id;
}
// =====================================================
// KIỂM TRA ADMIN
// =====================================================

function requireAdmin(req, res) {
    const user = getCurrentUser(req);
    if (!user) {
        res.status(401).json({
            success: false,
            message: "Bạn chưa đăng nhập."
        });
        return null;
    }
    if (user.role !== "ADMIN") {
        res.status(403).json({
            success: false,
            message: "Bạn không có quyền quản trị."
        });
        return null;
    }
    return user;
}
// =====================================================
// DANH SÁCH 4 CA
// GET /api/schedules/shifts
// =====================================================

function getShiftTypes(req, res) {
    const data =
        Object.entries(SHIFT_CONFIG)
            .map(
                ([value, config]) => ({
                    value,
                    name: config.name,
                    display_start: config.displayStart,
                    display_end: config.displayEnd,
                    start_time: config.start_time,
                    end_time: config.end_time
                })
            );
    return res.json({
        success: true,
        data
    });
}
// =====================================================
// LỊCH CỦA BÁC SĨ ĐANG ĐĂNG NHẬP
//
// GET /api/schedules/my
// =====================================================

async function getMySchedules(req, res) {
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
                    "Chỉ bác sĩ mới có thể xem lịch của mình."
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
        const [schedules] =
            await pool.query(
                `
                SELECT
                    s.id,
                    s.doctor_id,
                    s.schedule_date,
                    s.shift_type,
                    s.approval_status,
                    s.approved_by,
                    s.approved_at,
                    s.rejection_reason,
                    s.start_time,
                    s.end_time,
                    s.status,
                    au.full_name AS approved_by_name
                FROM schedules s
                LEFT JOIN users au
                    ON s.approved_by = au.id
                WHERE s.doctor_id = ?
                ORDER BY
                    s.schedule_date ASC,
                    s.start_time ASC
                `,
                [doctorId]
            );
        const data =
            schedules.map(
                schedule => {
                    const shift =
                        SHIFT_CONFIG[
                            schedule.shift_type
                        ];
                    return {
                        ...schedule,
                        shift_name:
                            shift?.name ||
                            schedule.shift_type ||
                            "Chưa xác định",
                        display_start:
                            shift?.displayStart ||
                            String(
                                schedule.start_time ||
                                ""
                            ).slice(0, 5),
                        display_end:
                            shift?.displayEnd ||
                            String(
                                schedule.end_time ||
                                ""
                            ).slice(0, 5)
                    };
                }
            );
        return res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error(
            "GET MY SCHEDULES ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy lịch làm việc."
        });
    }
}
// =====================================================
// ADMIN XEM TOÀN BỘ LỊCH
//
// GET /api/schedules/admin
// =====================================================

async function getAllSchedules(req, res) {
    try {
        const admin =
            requireAdmin(
                req,
                res
            );
        if (!admin) {
            return;
        }
        const [schedules] =
            await pool.query(
                `
                SELECT
                    s.id,
                    s.doctor_id,
                    s.schedule_date,
                    s.shift_type,
                    s.approval_status,
                    s.approved_by,
                    s.approved_at,
                    s.rejection_reason,
                    s.start_time,
                    s.end_time,
                    s.status,
                    du.full_name AS doctor_name,
                    au.full_name AS approved_by_name
                FROM schedules s
                INNER JOIN doctors d
                    ON s.doctor_id = d.id
                INNER JOIN users du
                    ON d.user_id = du.id
                LEFT JOIN users au
                    ON s.approved_by = au.id
                ORDER BY
                    s.schedule_date DESC,
                    s.start_time ASC,
                    du.full_name ASC
                `
            );
        const data =
            schedules.map(
                schedule => {
                    const shift =
                        SHIFT_CONFIG[
                            schedule.shift_type
                        ];
                    return {
                        ...schedule,
                        shift_name:
                            shift?.name ||
                            schedule.shift_type ||
                            "Chưa xác định",
                        display_start:
                            shift?.displayStart ||
                            String(
                                schedule.start_time ||
                                ""
                            ).slice(0, 5),
                        display_end:
                            shift?.displayEnd ||
                            String(
                                schedule.end_time ||
                                ""
                            ).slice(0, 5)
                    };
                }
            );
        return res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error(
            "GET ALL SCHEDULES ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy danh sách lịch."
        });
    }
}
// =====================================================
// CHI TIẾT LỊCH
//
// GET /api/schedules/:id
// =====================================================

async function getScheduleById(req, res) {
    try {
        const scheduleId =
            Number(
                req.params.id
            );
        if (
            !scheduleId ||
            scheduleId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch không hợp lệ."
            });
        }
        const [rows] =
            await pool.query(
                `
                SELECT
                    s.id,
                    s.doctor_id,
                    s.schedule_date,
                    s.shift_type,
                    s.approval_status,
                    s.approved_by,
                    s.approved_at,
                    s.rejection_reason,
                    s.start_time,
                    s.end_time,
                    s.status,
                    du.full_name AS doctor_name,
                    au.full_name AS approved_by_name
                FROM schedules s
                INNER JOIN doctors d
                    ON s.doctor_id = d.id
                INNER JOIN users du
                    ON d.user_id = du.id
                LEFT JOIN users au
                    ON s.approved_by = au.id
                WHERE s.id = ?
                LIMIT 1
                `,
                [scheduleId]
            );
        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lịch."
            });
        }
        const schedule =
            rows[0];
        const shift =
            SHIFT_CONFIG[
                schedule.shift_type
            ];
        return res.json({
            success: true,
            data: {
                ...schedule,
                shift_name:
                    shift?.name ||
                    schedule.shift_type ||
                    "Chưa xác định",
                display_start:
                    shift?.displayStart ||
                    String(
                        schedule.start_time ||
                        ""
                    ).slice(0, 5),
                display_end:
                    shift?.displayEnd ||
                    String(
                        schedule.end_time ||
                        ""
                    ).slice(0, 5)
            }
        });
    } catch (error) {
        console.error(
            "GET SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy thông tin lịch."
        });
    }
}
// =====================================================
// TẠO LỊCH
//
// POST /api/schedules
//
// DOCTOR:
//   doctor_id lấy từ session
//   approval_status = PENDING
//
// ADMIN:
//   được chọn doctor_id
//   approval_status = APPROVED
// =====================================================

async function createSchedule(req, res) {
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
            user.role !== "DOCTOR" &&
            user.role !== "ADMIN"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền tạo lịch."
            });
        }
        const {
            doctor_id,
            schedule_date,
            shift_type
        } = req.body;
        // =================================================
        // KIỂM TRA NGÀY
        // =================================================
        if (!schedule_date) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng chọn ngày làm việc."
            });
        }
        // =================================================
        // KIỂM TRA CA
        // =================================================
        if (
            !shift_type ||
            !SHIFT_CONFIG[shift_type]
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Ca làm việc không hợp lệ."
            });
        }
        // =================================================
        // XÁC ĐỊNH DOCTOR ID
        // =================================================
        let finalDoctorId = null;
        if (
            user.role === "DOCTOR"
        ) {
            finalDoctorId =
                await getDoctorIdFromUser(
                    user
                );
            if (!finalDoctorId) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Tài khoản chưa được liên kết với hồ sơ bác sĩ."
                });
            }
        }
        if (
            user.role === "ADMIN"
        ) {
            finalDoctorId =
                Number(
                    doctor_id
                );
            if (
                !finalDoctorId ||
                finalDoctorId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Admin phải chọn bác sĩ."
                });
            }
        }
        // =================================================
        // KIỂM TRA BÁC SĨ
        // =================================================
        const [doctors] =
            await pool.query(
                `
                SELECT id
                FROM doctors
                WHERE id = ?
                LIMIT 1
                `,
                [finalDoctorId]
            );
        if (!doctors.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy bác sĩ."
            });
        }
        const shift =
            SHIFT_CONFIG[
                shift_type
            ];
        // =================================================
        // KIỂM TRA TRÙNG CA
        // =================================================
        const [duplicateSchedules] =
            await pool.query(
                `
                SELECT id
                FROM schedules
                WHERE doctor_id = ?
                  AND schedule_date = ?
                  AND shift_type = ?
                  AND approval_status <>
                      'REJECTED'
                LIMIT 1
                `,
                [
                    finalDoctorId,
                    schedule_date,
                    shift_type
                ]
            );
        if (
            duplicateSchedules.length
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "Bác sĩ đã có lịch cho ca này trong ngày."
            });
        }
        // =================================================
        // KIỂM TRA CHỒNG GIỜ
        // =================================================
        const [overlapSchedules] =
            await pool.query(
                `
                SELECT id
                FROM schedules
                WHERE doctor_id = ?
                  AND schedule_date = ?
                  AND approval_status <>
                      'REJECTED'
                  AND start_time < ?
                  AND end_time > ?
                LIMIT 1
                `,
                [
                    finalDoctorId,
                    schedule_date,
                    shift.end_time,
                    shift.start_time
                ]
            );
        if (
            overlapSchedules.length
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "Ca làm việc bị trùng với một lịch khác của bác sĩ."
            });
        }
        // =================================================
        // DOCTOR → CHỜ DUYỆT
        // ADMIN  → DUYỆT NGAY
        // =================================================
        const approvalStatus =
            user.role === "ADMIN"
                ? "APPROVED"
                : "PENDING";
        const scheduleStatus =
            user.role === "ADMIN"
                ? "AVAILABLE"
                : "CLOSED";
        const approvedBy =
            user.role === "ADMIN"
                ? user.id
                : null;
        const approvedAt =
            user.role === "ADMIN"
                ? new Date()
                : null;
        const [result] =
            await pool.query(
                `
                INSERT INTO schedules
                (
                    doctor_id,
                    schedule_date,
                    shift_type,
                    approval_status,
                    approved_by,
                    approved_at,
                    rejection_reason,
                    start_time,
                    end_time,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
                `,
                [
                    finalDoctorId,
                    schedule_date,
                    shift_type,
                    approvalStatus,
                    approvedBy,
                    approvedAt,
                    shift.start_time,
                    shift.end_time,
                    scheduleStatus
                ]
            );
        return res.status(201).json({
            success: true,
            message:
                user.role === "ADMIN"
                    ? "Admin đã tạo lịch làm việc thành công."
                    : "Đăng ký lịch làm việc thành công. Lịch đang chờ Admin duyệt.",
            data: {
                id:
                    result.insertId,
                doctor_id:
                    finalDoctorId,
                schedule_date,
                shift_type,
                shift_name:
                    shift.name,
                display_start:
                    shift.displayStart,
                display_end:
                    shift.displayEnd,
                approval_status:
                    approvalStatus,
                status:
                    scheduleStatus
            }
        });
    } catch (error) {
        console.error(
            "CREATE SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể tạo lịch làm việc."
        });
    }
}
// =====================================================
// CẬP NHẬT LỊCH
//
// PUT /api/schedules/:id
// =====================================================

async function updateSchedule(req, res) {
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
            user.role !== "DOCTOR" &&
            user.role !== "ADMIN"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền cập nhật lịch."
            });
        }
        const scheduleId =
            Number(
                req.params.id
            );
        if (!scheduleId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch không hợp lệ."
            });
        }
        const {
            schedule_date,
            shift_type,
            status
        } = req.body;
        const [rows] =
            await pool.query(
                `
                SELECT
                    id,
                    doctor_id,
                    schedule_date,
                    shift_type,
                    approval_status,
                    status
                FROM schedules
                WHERE id = ?
                LIMIT 1
                `,
                [scheduleId]
            );
        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lịch."
            });
        }
        const existing =
            rows[0];
        // =================================================
        // KIỂM TRA QUYỀN BÁC SĨ
        // =================================================
        if (
            user.role === "DOCTOR"
        ) {
            const doctorId =
                await getDoctorIdFromUser(
                    user
                );
            if (
                !doctorId ||
                Number(existing.doctor_id)
                !==
                Number(doctorId)
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Bạn không có quyền cập nhật lịch này."
                });
            }
        }
        // =================================================
        // ADMIN KHÔNG ĐƯỢC ĐỂ TRỐNG SHIFT
        // =================================================
        const finalDate =
            schedule_date ||
            existing.schedule_date;
        const finalShift =
            shift_type ||
            existing.shift_type;
        if (
            !SHIFT_CONFIG[finalShift]
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Ca làm việc không hợp lệ."
            });
        }
        const shift =
            SHIFT_CONFIG[
                finalShift
            ];
        // =================================================
        // BÁC SĨ ĐỔI NGÀY/CA
        // → PHẢI DUYỆT LẠI
        // =================================================
        const scheduleChanged =
            String(
                finalDate
            ) !==
            String(
                existing.schedule_date
            )
            ||
            finalShift !==
            existing.shift_type;
        let newApprovalStatus =
            existing.approval_status;
        let newApprovedBy =
            null;
        let newApprovedAt =
            null;
        let newStatus =
            status ||
            existing.status;
        if (
            user.role === "DOCTOR"
            &&
            scheduleChanged
        ) {
            newApprovalStatus =
                "PENDING";
            newApprovedBy =
                null;
            newApprovedAt =
                null;
            newStatus =
                "CLOSED";
        }
        if (
            user.role === "DOCTOR"
            &&
            existing.approval_status !==
            "APPROVED"
            &&
            status === "AVAILABLE"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Lịch chưa được Admin duyệt nên chưa thể mở."
            });
        }
        // =================================================
        // ADMIN ĐIỀU CHỈNH
        // → DUYỆT NGAY
        // =================================================
        if (
            user.role === "ADMIN"
        ) {
            newApprovalStatus =
                "APPROVED";
            newApprovedBy =
                user.id;
            newApprovedAt =
                new Date();
            newStatus =
                status === "CLOSED"
                    ? "CLOSED"
                    : "AVAILABLE";
        }
        // =================================================
        // KIỂM TRA TRÙNG
        // =================================================
        if (
            scheduleChanged
        ) {
            const [duplicates] =
                await pool.query(
                    `
                    SELECT id
                    FROM schedules
                    WHERE doctor_id = ?
                      AND schedule_date = ?
                      AND shift_type = ?
                      AND id <> ?
                      AND approval_status <>
                          'REJECTED'
                    LIMIT 1
                    `,
                    [
                        existing.doctor_id,
                        finalDate,
                        finalShift,
                        scheduleId
                    ]
                );
            if (
                duplicates.length
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Bác sĩ đã có lịch cho ca này trong ngày."
                });
            }
        }
        await pool.query(
            `
            UPDATE schedules
            SET
                schedule_date = ?,
                shift_type = ?,
                start_time = ?,
                end_time = ?,
                approval_status = ?,
                approved_by = ?,
                approved_at = ?,
                rejection_reason = NULL,
                status = ?
            WHERE id = ?
            `,
            [
                finalDate,
                finalShift,
                shift.start_time,
                shift.end_time,
                newApprovalStatus,
                newApprovedBy,
                newApprovedAt,
                newStatus,
                scheduleId
            ]
        );
        return res.json({
            success: true,
            message:
                scheduleChanged &&
                user.role === "DOCTOR"
                    ? "Lịch đã thay đổi và được chuyển sang trạng thái chờ Admin duyệt."
                    : "Cập nhật lịch thành công."
        });
    } catch (error) {
        console.error(
            "UPDATE SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể cập nhật lịch."
        });
    }
}
// =====================================================
// XÓA LỊCH
//
// DELETE /api/schedules/:id
// =====================================================

async function deleteSchedule(req, res) {
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
            user.role !== "DOCTOR" &&
            user.role !== "ADMIN"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền xóa lịch."
            });
        }
        const scheduleId =
            Number(
                req.params.id
            );
        const [rows] =
            await pool.query(
                `
                SELECT
                    id,
                    doctor_id,
                    approval_status
                FROM schedules
                WHERE id = ?
                LIMIT 1
                `,
                [scheduleId]
            );
        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lịch."
            });
        }
        const schedule =
            rows[0];
        // =================================================
        // DOCTOR CHỈ XÓA LỊCH CỦA MÌNH
        // =================================================
        if (
            user.role === "DOCTOR"
        ) {
            const doctorId =
                await getDoctorIdFromUser(
                    user
                );
            if (
                !doctorId ||
                Number(schedule.doctor_id)
                !==
                Number(doctorId)
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Bạn không có quyền xóa lịch này."
                });
            }
        }
        // =================================================
        // KHÔNG XÓA NẾU ĐÃ CÓ LỊCH HẸN
        // =================================================
        const [appointments] =
            await pool.query(
                `
                SELECT id
                FROM appointments
                WHERE schedule_id = ?
                  AND status <>
                      'CANCELLED'
                LIMIT 1
                `,
                [scheduleId]
            );
        if (
            appointments.length
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Lịch này đã có bệnh nhân đặt. Không thể xóa."
            });
        }
        await pool.query(
            `
            DELETE FROM schedules
            WHERE id = ?
            `,
            [scheduleId]
        );
        return res.json({
            success: true,
            message:
                "Đã xóa lịch làm việc."
        });
    } catch (error) {
        console.error(
            "DELETE SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể xóa lịch."
        });
    }
}
// =====================================================
// ADMIN DUYỆT LỊCH
//
// PATCH /api/schedules/:id/approve
// =====================================================

async function approveSchedule(req, res) {
    try {
        const admin =
            requireAdmin(
                req,
                res
            );
        if (!admin) {
            return;
        }
        const scheduleId =
            Number(
                req.params.id
            );
        const [rows] =
            await pool.query(
                `
                SELECT
                    id,
                    doctor_id,
                    approval_status
                FROM schedules
                WHERE id = ?
                LIMIT 1
                `,
                [scheduleId]
            );
        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lịch."
            });
        }
        const schedule =
            rows[0];
        if (
            schedule.approval_status
            ===
            "APPROVED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Lịch này đã được duyệt."
            });
        }
        // =================================================
        // KIỂM TRA TRÙNG TRƯỚC KHI DUYỆT
        // =================================================
        const [conflicts] =
            await pool.query(
                `
                SELECT id
                FROM schedules
                WHERE doctor_id = ?
                  AND approval_status =
                      'APPROVED'
                  AND id <> ?
                  AND schedule_date =
                      (
                          SELECT schedule_date
                          FROM schedules
                          WHERE id = ?
                      )
                  AND start_time < 
                      (
                          SELECT end_time
                          FROM schedules
                          WHERE id = ?
                      )
                  AND end_time >
                      (
                          SELECT start_time
                          FROM schedules
                          WHERE id = ?
                      )
                LIMIT 1
                `,
                [
                    schedule.doctor_id,
                    scheduleId,
                    scheduleId,
                    scheduleId,
                    scheduleId
                ]
            );
        if (
            conflicts.length
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "Không thể duyệt vì lịch bị trùng với một ca đã được duyệt."
            });
        }
        await pool.query(
            `
            UPDATE schedules
            SET
                approval_status =
                    'APPROVED',
                approved_by = ?,
                approved_at =
                    CURRENT_TIMESTAMP,
                rejection_reason = NULL,
                status = 'AVAILABLE'
            WHERE id = ?
            `,
            [
                admin.id,
                scheduleId
            ]
        );
        return res.json({
            success: true,
            message:
                "Duyệt lịch làm việc thành công."
        });
    } catch (error) {
        console.error(
            "APPROVE SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể duyệt lịch."
        });
    }
}
// =====================================================
// ADMIN TỪ CHỐI LỊCH
//
// PATCH /api/schedules/:id/reject
// =====================================================

async function rejectSchedule(req, res) {
    try {
        const admin =
            requireAdmin(
                req,
                res
            );
        if (!admin) {
            return;
        }
        const scheduleId =
            Number(
                req.params.id
            );
        const rejectionReason =
            String(
                req.body?.rejection_reason ||
                ""
            ).trim();
        if (!rejectionReason) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập lý do từ chối."
            });
        }
        const [rows] =
            await pool.query(
                `
                SELECT
                    id,
                    approval_status
                FROM schedules
                WHERE id = ?
                LIMIT 1
                `,
                [scheduleId]
            );
        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lịch."
            });
        }
        if (
            rows[0].approval_status
            ===
            "APPROVED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Lịch đã được duyệt, không thể từ chối bằng thao tác này."
            });
        }
        await pool.query(
            `
            UPDATE schedules
            SET
                approval_status =
                    'REJECTED',
                approved_by = ?,
                approved_at =
                    CURRENT_TIMESTAMP,
                rejection_reason = ?,
                status = 'CLOSED'
            WHERE id = ?
            `,
            [
                admin.id,
                rejectionReason,
                scheduleId
            ]
        );
        return res.json({
            success: true,
            message:
                "Đã từ chối lịch làm việc."
        });
    } catch (error) {
        console.error(
            "REJECT SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể từ chối lịch."
        });
    }
}
// =====================================================
// EXPORT
// =====================================================

module.exports = {
    getShiftTypes,
    getMySchedules,
    getAllSchedules,
    getScheduleById,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    approveSchedule,
    rejectSchedule
};