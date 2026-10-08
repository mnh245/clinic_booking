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
// HELPER: LẤY DOCTOR ID TỪ USER ĐANG ĐĂNG NHẬP
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
// 1. LẤY GIỜ KHÁM CÒN TRỐNG
//
// GET
// /api/doctors/:doctorId/available-slots?date=YYYY-MM-DD
// =====================================================

async function getAvailableSlots(req, res) {
    try {
        const { doctorId } = req.params;
        const { date } = req.query;
        if (!doctorId || !date) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng chọn bác sĩ và ngày khám."
            });
        }
        // =================================================
        // LẤY LỊCH LÀM VIỆC
        // =================================================
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
                  AND schedule_date = ?
                  AND status = 'AVAILABLE'
                ORDER BY start_time ASC
                `,
                [
                    doctorId,
                    date
                ]
            );
        if (schedules.length === 0) {
            return res.json({
                success: true,
                data: []
            });
        }
        // =================================================
        // LẤY CÁC LỊCH HẸN ĐÃ ĐẶT
        // =================================================
        const scheduleIds =
            schedules.map(
                schedule => schedule.id
            );
        const [appointments] =
            await pool.query(
                `
                SELECT
                    schedule_id,
                    appointment_time,
                    status
                FROM appointments
                WHERE doctor_id = ?
                  AND schedule_id IN (?)
                  AND status <> 'CANCELLED'
                `,
                [
                    doctorId,
                    scheduleIds
                ]
            );
        // =================================================
        // SET GIỜ ĐÃ ĐẶT
        // =================================================
        const bookedSlots =
            new Set(
                appointments.map(
                    appointment =>
                        `${appointment.schedule_id}_${appointment.appointment_time}`
                )
            );
        // =================================================
        // MỖI LƯỢT KHÁM = 30 PHÚT
        // =================================================
        const SLOT_MINUTES = 30;
        const slots = [];
        for (
            const schedule
            of schedules
        ) {
            const start =
                new Date(
                    `1970-01-01T${schedule.start_time}`
                );
            const end =
                new Date(
                    `1970-01-01T${schedule.end_time}`
                );
            let current =
                new Date(start);
            while (
                current.getTime()
                +
                SLOT_MINUTES * 60000
                <=
                end.getTime()
            ) {
                const hour =
                    String(
                        current.getHours()
                    ).padStart(
                        2,
                        "0"
                    );
                const minute =
                    String(
                        current.getMinutes()
                    ).padStart(
                        2,
                        "0"
                    );
                const time =
                    `${hour}:${minute}:00`;
                const key =
                    `${schedule.id}_${time}`;
                slots.push({
                    schedule_id:
                        schedule.id,
                    doctor_id:
                        Number(doctorId),
                    date:
                        schedule.schedule_date,
                    shift_type:
                        schedule.shift_type,
                    time,
                    available:
                        !bookedSlots.has(key)
                });
                current =
                    new Date(
                        current.getTime()
                        +
                        SLOT_MINUTES * 60000
                    );
            }
        }
        return res.json({
            success: true,
            data: slots
        });
    } catch (error) {
        console.error(
            "GET AVAILABLE SLOTS ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy giờ khám."
        });
    }
}
// =====================================================
// 2. ĐẶT LỊCH KHÁM
//
// POST /api/appointments
// =====================================================

async function createAppointment(req, res) {
    const connection =
        await pool.getConnection();
    try {
        const user =
            getCurrentUser(req);
        // =================================================
        // PHẢI ĐĂNG NHẬP
        // =================================================
        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "Bạn cần đăng nhập trước khi đặt lịch."
            });
        }
        // =================================================
        // CHỈ BỆNH NHÂN ĐƯỢC ĐẶT LỊCH
        // =================================================
        if (
            user.role !== "PATIENT"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Tài khoản hiện tại không phải bệnh nhân."
            });
        }
        const {
            doctor_id,
            schedule_id,
            appointment_time,
            reason
        } = req.body;
        // =================================================
        // BỆNH NHÂN LẤY TỪ SESSION
        // =================================================
        const patient_id =
            Number(user.id);
        if (
            !patient_id ||
            !doctor_id ||
            !schedule_id ||
            !appointment_time
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập đầy đủ thông tin đặt lịch."
            });
        }
        // =================================================
        // NẾU FRONTEND CÒN GỬI patient_id
        // THÌ PHẢI KHỚP SESSION
        // =================================================
        if (
            req.body.patient_id &&
            Number(req.body.patient_id)
            !==
            patient_id
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Thông tin bệnh nhân không hợp lệ."
            });
        }
        await connection.beginTransaction();
        // =================================================
        // KIỂM TRA BÁC SĨ
        // =================================================
        const [doctors] =
            await connection.query(
                `
                SELECT id
                FROM doctors
                WHERE id = ?
                LIMIT 1
                `,
                [
                    Number(doctor_id)
                ]
            );
        if (doctors.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy bác sĩ."
            });
        }
        // =================================================
        // KHÓA VÀ KIỂM TRA LỊCH
        // =================================================
        const [schedules] =
            await connection.query(
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
                WHERE id = ?
                  AND doctor_id = ?
                FOR UPDATE
                `,
                [
                    Number(schedule_id),
                    Number(doctor_id)
                ]
            );
        if (schedules.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message:
                    "Lịch làm việc không tồn tại."
            });
        }
        const schedule =
            schedules[0];
        // =================================================
        // KIỂM TRA LỊCH CÒN MỞ
        // =================================================
        if (
            schedule.status
            !==
            "AVAILABLE"
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Lịch khám này hiện không khả dụng."
            });
        }
        // =================================================
        // KIỂM TRA GIỜ NẰM TRONG CA
        // =================================================
        if (
            appointment_time <
            schedule.start_time
            ||
            appointment_time >=
            schedule.end_time
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Giờ khám không nằm trong lịch làm việc của bác sĩ."
            });
        }
        // =================================================
        // KIỂM TRA GIỜ KHÁM PHẢI ĐÚNG MỐC 30 PHÚT
        // =================================================
        const timeParts =
            String(
                appointment_time
            )
                .split(":");
        const appointmentHour =
            Number(
                timeParts[0]
            );
        const appointmentMinute =
            Number(
                timeParts[1]
            );
        if (
            Number.isNaN(
                appointmentHour
            )
            ||
            Number.isNaN(
                appointmentMinute
            )
            ||
            !(
                appointmentMinute === 0
                ||
                appointmentMinute === 30
            )
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Giờ khám không hợp lệ."
            });
        }
        // =================================================
        // KIỂM TRA BỆNH NHÂN TRÙNG LỊCH
        // =================================================
        const [patientExisting] =
            await connection.query(
                `
                SELECT a.id
                FROM appointments a
                JOIN schedules s
                    ON a.schedule_id = s.id
                WHERE a.patient_id = ?
                  AND s.schedule_date = ?
                  AND a.appointment_time = ?
                  AND a.status <> 'CANCELLED'
                LIMIT 1
                `,
                [
                    patient_id,
                    schedule.schedule_date,
                    appointment_time
                ]
            );
        if (
            patientExisting.length > 0
        ) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message:
                    "Bạn đã có một lịch khám vào thời gian này."
            });
        }
        // =================================================
        // KIỂM TRA GIỜ CỦA BÁC SĨ ĐÃ BỊ ĐẶT
        // =================================================
        const [doctorExisting] =
            await connection.query(
                `
                SELECT id
                FROM appointments
                WHERE doctor_id = ?
                  AND schedule_id = ?
                  AND appointment_time = ?
                  AND status <> 'CANCELLED'
                LIMIT 1
                `,
                [
                    Number(doctor_id),
                    Number(schedule_id),
                    appointment_time
                ]
            );
        if (
            doctorExisting.length > 0
        ) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message:
                    "Giờ khám này đã được đặt."
            });
        }
        // =================================================
        // TẠO LỊCH HẸN
        // =================================================
        const [result] =
            await connection.query(
                `
                INSERT INTO appointments
                (
                    patient_id,
                    doctor_id,
                    schedule_id,
                    appointment_time,
                    reason,
                    status
                )
                VALUES (?, ?, ?, ?, ?, 'PENDING')
                `,
                [
                    patient_id,
                    Number(doctor_id),
                    Number(schedule_id),
                    appointment_time,
                    reason
                        ? String(reason).trim()
                        : null
                ]
            );
        await connection.commit();
        return res.status(201).json({
            success: true,
            message:
                "Đặt lịch khám thành công.",
            data: {
                id:
                    result.insertId,
                patient_id,
                doctor_id:
                    Number(doctor_id),
                schedule_id:
                    Number(schedule_id),
                appointment_time,
                reason:
                    reason
                        ? String(reason).trim()
                        : null,
                status:
                    "PENDING"
            }
        });
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error(
                "ROLLBACK ERROR:",
                rollbackError
            );
        }
        console.error(
            "CREATE APPOINTMENT ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể đặt lịch khám."
        });
    } finally {
        connection.release();
    }
}
// =====================================================
// 3. LẤY LỊCH KHÁM CỦA BỆNH NHÂN
//
// GET /api/patients/:patientId/appointments
// =====================================================

async function getPatientAppointments(
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
        const patientId =
            Number(
                req.params.patientId
            );
        if (!patientId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID bệnh nhân không hợp lệ."
            });
        }
        // =================================================
        // BỆNH NHÂN CHỈ ĐƯỢC XEM LỊCH CỦA MÌNH
        // ADMIN CÓ THỂ XEM
        // =================================================
        if (
            user.role !== "ADMIN"
            &&
            Number(user.id)
            !==
            patientId
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền xem lịch của bệnh nhân này."
            });
        }
        const [rows] =
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
                    u.full_name AS doctor_name,
                    sp.name AS specialty_name
                FROM appointments a
                JOIN schedules s
                    ON a.schedule_id = s.id
                JOIN doctors d
                    ON a.doctor_id = d.id
                JOIN users u
                    ON d.user_id = u.id
                LEFT JOIN specialties sp
                    ON d.specialty_id = sp.id
                WHERE a.patient_id = ?
                ORDER BY
                    s.schedule_date DESC,
                    a.appointment_time DESC
                `,
                [
                    patientId
                ]
            );
        return res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error(
            "GET PATIENT APPOINTMENTS ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy lịch khám."
        });
    }
}
// =====================================================
// 4. HỦY LỊCH KHÁM CỦA BỆNH NHÂN
//
// PATCH /api/appointments/:id/cancel
// =====================================================

async function cancelAppointment(
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
            user.role !== "PATIENT"
            &&
            user.role !== "ADMIN"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền hủy lịch."
            });
        }
        const appointmentId =
            Number(
                req.params.id
            );
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch hẹn không hợp lệ."
            });
        }
        const [appointments] =
            await pool.query(
                `
                SELECT
                    id,
                    patient_id,
                    status
                FROM appointments
                WHERE id = ?
                LIMIT 1
                `,
                [
                    appointmentId
                ]
            );
        if (
            appointments.length === 0
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lịch hẹn."
            });
        }
        const appointment =
            appointments[0];
        if (
            user.role !== "ADMIN"
            &&
            Number(
                appointment.patient_id
            )
            !==
            Number(user.id)
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền hủy lịch hẹn này."
            });
        }
        if (
            appointment.status !==
            "PENDING"
            &&
            appointment.status !==
            "CONFIRMED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Lịch hẹn hiện tại không thể hủy."
            });
        }
        await pool.query(
            `
            UPDATE appointments
            SET
                status = 'CANCELLED',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                appointmentId
            ]
        );
        return res.json({
            success: true,
            message:
                "Đã hủy lịch khám."
        });
    } catch (error) {
        console.error(
            "CANCEL APPOINTMENT ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể hủy lịch."
        });
    }
}
// =====================================================
// HELPER: KIỂM TRA BÁC SĨ CÓ QUYỀN VỚI APPOINTMENT
// =====================================================

async function getDoctorAppointment(
    appointmentId,
    user
) {
    if (!user) {
        return {
            error: {
                status: 401,
                message:
                    "Bạn chưa đăng nhập."
            }
        };
    }
    if (
        user.role !== "DOCTOR"
        &&
        user.role !== "ADMIN"
    ) {
        return {
            error: {
                status: 403,
                message:
                    "Bạn không có quyền xử lý lịch hẹn."
            }
        };
    }
    const [rows] =
        await pool.query(
            `
            SELECT
                id,
                patient_id,
                doctor_id,
                schedule_id,
                appointment_time,
                status,
                actual_arrival_time
            FROM appointments
            WHERE id = ?
            LIMIT 1
            `,
            [
                appointmentId
            ]
        );
    if (
        rows.length === 0
    ) {
        return {
            error: {
                status: 404,
                message:
                    "Không tìm thấy lịch hẹn."
            }
        };
    }
    const appointment =
        rows[0];
    if (
        user.role === "DOCTOR"
    ) {
        const doctorId =
            await getDoctorIdFromUser(
                user
            );
        if (!doctorId) {
            return {
                error: {
                    status: 403,
                    message:
                        "Tài khoản bác sĩ chưa được liên kết với hồ sơ bác sĩ."
                }
            };
        }
        if (
            Number(
                appointment.doctor_id
            )
            !==
            Number(doctorId)
        ) {
            return {
                error: {
                    status: 403,
                    message:
                        "Bạn không có quyền xử lý lịch hẹn này."
                }
            };
        }
    }
    return {
        appointment
    };
}
// =====================================================
// 5. BÁC SĨ XÁC NHẬN LỊCH
//
// POST /api/appointments/:id/confirm
// =====================================================

async function confirmAppointment(
    req,
    res
) {
    try {
        const appointmentId =
            Number(
                req.params.id
            );
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch khám không hợp lệ."
            });
        }
        const check =
            await getDoctorAppointment(
                appointmentId,
                getCurrentUser(req)
            );
        if (check.error) {
            return res.status(
                check.error.status
            ).json({
                success: false,
                message:
                    check.error.message
            });
        }
        const appointment =
            check.appointment;
        if (
            appointment.status !==
            "PENDING"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch khám PENDING mới có thể xác nhận."
            });
        }
        await pool.query(
            `
            UPDATE appointments
            SET
                status = 'CONFIRMED',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                appointmentId
            ]
        );
        return res.json({
            success: true,
            message:
                "Xác nhận lịch khám thành công."
        });
    } catch (error) {
        console.error(
            "CONFIRM APPOINTMENT ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Lỗi máy chủ khi xác nhận lịch khám."
        });
    }
}
// =====================================================
// 6. GHI NHẬN BỆNH NHÂN ĐẾN KHÁM
//
// POST /api/appointments/:id/arrival
// =====================================================

async function recordArrival(
    req,
    res
) {
    try {
        const appointmentId =
            Number(
                req.params.id
            );
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch khám không hợp lệ."
            });
        }
        const check =
            await getDoctorAppointment(
                appointmentId,
                getCurrentUser(req)
            );
        if (check.error) {
            return res.status(
                check.error.status
            ).json({
                success: false,
                message:
                    check.error.message
            });
        }
        const appointment =
            check.appointment;
        if (
            appointment.status !==
            "CONFIRMED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch khám CONFIRMED mới có thể ghi nhận đến khám."
            });
        }
        if (
            appointment.actual_arrival_time
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Bệnh nhân đã được ghi nhận đến khám."
            });
        }
        // =================================================
        // THỜI GIAN HIỆN TẠI
        // =================================================
        const now =
            new Date();
        const currentHour =
            now.getHours();
        const currentMinute =
            now.getMinutes();
        const [appointmentHour, appointmentMinute] =
            String(
                appointment.appointment_time
            )
                .split(":")
                .map(Number);
        const currentTotalMinutes =
            currentHour * 60
            +
            currentMinute;
        const appointmentTotalMinutes =
            appointmentHour * 60
            +
            appointmentMinute;
        const lateMinutes =
            Math.max(
                0,
                currentTotalMinutes
                -
                appointmentTotalMinutes
            );
        const actualArrivalTime =
            `${String(currentHour).padStart(2, "0")}:` +
            `${String(currentMinute).padStart(2, "0")}:00`;
        await pool.query(
            `
            UPDATE appointments
            SET
                actual_arrival_time = ?,
                late_minutes = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                actualArrivalTime,
                lateMinutes,
                appointmentId
            ]
        );
        return res.json({
            success: true,
            message:
                lateMinutes > 0
                    ? `Bệnh nhân đã đến muộn ${lateMinutes} phút.`
                    : "Bệnh nhân đã đến đúng giờ.",
            data: {
                actual_arrival_time:
                    actualArrivalTime,
                late_minutes:
                    lateMinutes
            }
        });
    } catch (error) {
        console.error(
            "RECORD ARRIVAL ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Lỗi máy chủ khi ghi nhận bệnh nhân đến."
        });
    }
}
// =====================================================
// 7. ĐÁNH DẤU KHÔNG ĐẾN
//
// POST /api/appointments/:id/no-show
// =====================================================

async function markNoShow(
    req,
    res
) {
    try {
        const appointmentId =
            Number(
                req.params.id
            );
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch khám không hợp lệ."
            });
        }
        const check =
            await getDoctorAppointment(
                appointmentId,
                getCurrentUser(req)
            );
        if (check.error) {
            return res.status(
                check.error.status
            ).json({
                success: false,
                message:
                    check.error.message
            });
        }
        const appointment =
            check.appointment;
        if (
            appointment.status !==
            "CONFIRMED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch khám CONFIRMED mới có thể đánh dấu không đến."
            });
        }
        if (
            appointment.actual_arrival_time
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Bệnh nhân đã đến khám nên không thể đánh dấu NO_SHOW."
            });
        }
        await pool.query(
            `
            UPDATE appointments
            SET
                status = 'NO_SHOW',
                note =
                    COALESCE(
                        note,
                        'Bệnh nhân không đến khám'
                    ),
                updated_at =
                    CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                appointmentId
            ]
        );
        return res.json({
            success: true,
            message:
                "Đã đánh dấu bệnh nhân không đến khám."
        });
    } catch (error) {
        console.error(
            "NO SHOW ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Lỗi máy chủ khi xử lý NO_SHOW."
        });
    }
}
// =====================================================
// 8. HOÀN THÀNH KHÁM
//
// POST /api/appointments/:id/complete
// =====================================================

async function completeAppointment(
    req,
    res
) {
    try {
        const appointmentId =
            Number(
                req.params.id
            );
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch khám không hợp lệ."
            });
        }
        const check =
            await getDoctorAppointment(
                appointmentId,
                getCurrentUser(req)
            );
        if (check.error) {
            return res.status(
                check.error.status
            ).json({
                success: false,
                message:
                    check.error.message
            });
        }
        const appointment =
            check.appointment;
        if (
            appointment.status !==
            "CONFIRMED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch khám CONFIRMED mới có thể hoàn thành."
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
        await pool.query(
            `
            UPDATE appointments
            SET
                status = 'COMPLETED',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                appointmentId
            ]
        );
        return res.json({
            success: true,
            message:
                "Cuộc hẹn đã được đánh dấu hoàn thành."
        });
    } catch (error) {
        console.error(
            "COMPLETE APPOINTMENT ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Lỗi máy chủ khi hoàn thành cuộc hẹn."
        });
    }
}
// =====================================================
// EXPORT
// =====================================================

module.exports = {
    getAvailableSlots,
    createAppointment,
    getPatientAppointments,
    cancelAppointment,
    confirmAppointment,
    recordArrival,
    markNoShow,
    completeAppointment
};