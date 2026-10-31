const { pool } = require("../config/db");
const {
    sendSms,
    isSmsConfigured,
    isSmsSandbox,
    normalizeVietnamPhone
} = require("../services/sms.service");
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
    const [rows] = await pool.query(
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
// HELPER: NGÀY / GIỜ
// =====================================================

const MAX_DOCTORS_PER_SPECIALTY_SHIFT = 3;

function getDateKey(value) {
    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    return String(value || "").slice(0, 10);
}

function isTodayOrFuture(dateValue) {
    const now = new Date();
    const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");
    return getDateKey(dateValue) >= today;
}
// Chuẩn hóa giờ về HH:MM:SS
function normalizeTime(value) {
    const text = String(value ?? "").trim();
    if (/^\d{2}:\d{2}$/.test(text)) {
        return `${text}:00`;
    }
    if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
        return text;
    }
    return null;
}
// Kiểm tra mốc ngày + giờ còn ở tương lai (theo giờ server)
function isFutureSlot(dateValue, timeValue) {
    const dateKey = getDateKey(dateValue);
    const time = normalizeTime(timeValue);
    if (!dateKey || !time) {
        return false;
    }
    const slot = new Date(`${dateKey}T${time}`);
    return slot.getTime() > Date.now();
}
// YYYY-MM-DD -> DD/MM/YYYY
function formatDateDisplay(dateValue) {
    const [y, m, d] = getDateKey(dateValue).split("-");
    return `${d}/${m}/${y}`;
}
/**
 * Đếm số bác sĩ khác nhau trong một chuyên khoa, ngày và ca.
 *
 * activeOnly = false:
 * Đếm lịch chưa bị từ chối, bao gồm cả lịch đang chờ duyệt.
 *
 * activeOnly = true:
 * Chỉ đếm lịch đã được duyệt và đang mở.
 */
async function countSpecialtyShiftDoctors({
    specialtyId,
    scheduleDate,
    shiftType,
    excludeScheduleId = null,
    activeOnly = false
}) {
    if (!specialtyId || !scheduleDate || !shiftType) {
        return 0;
    }
    const conditions = [
        "d.specialty_id = ?",
        "s.schedule_date = ?",
        "s.shift_type = ?"
    ];
    const params = [
        specialtyId,
        getDateKey(scheduleDate),
        shiftType
    ];
    if (activeOnly) {
        conditions.push(
            "s.approval_status = 'APPROVED'",
            "s.status = 'AVAILABLE'"
        );
    } else {
        conditions.push("s.approval_status <> 'REJECTED'");
    }
    if (
        excludeScheduleId !== null &&
        excludeScheduleId !== undefined
    ) {
        conditions.push("s.id <> ?");
        params.push(excludeScheduleId);
    }
    const [rows] = await pool.query(
        `
        SELECT COUNT(DISTINCT s.doctor_id) AS total
        FROM schedules s
        INNER JOIN doctors d
            ON d.id = s.doctor_id
        WHERE ${conditions.join(" AND ")}
        `,
        params
    );
    return Number(rows[0]?.total || 0);
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
                message: "Vui lòng chọn bác sĩ và ngày khám."
            });
        }
        // =================================================
        // LẤY LỊCH LÀM VIỆC
        // =================================================
        const [schedules] = await pool.query(
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
              AND approval_status = 'APPROVED'
              AND status = 'AVAILABLE'
            ORDER BY start_time ASC
            `,
            [doctorId, date]
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
        const scheduleIds = schedules.map(
            schedule => schedule.id
        );
        const [appointments] = await pool.query(
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
            [doctorId, scheduleIds]
        );
        // =================================================
        // SET GIỜ ĐÃ ĐẶT
        // =================================================
        const bookedSlots = new Set(
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
        for (const schedule of schedules) {
            const start = new Date(
                `1970-01-01T${schedule.start_time}`
            );
            const end = new Date(
                `1970-01-01T${schedule.end_time}`
            );
            let current = new Date(start);
            while (
                current.getTime() + SLOT_MINUTES * 60000
                <=
                end.getTime()
            ) {
                const hour = String(
                    current.getHours()
                ).padStart(2, "0");
                const minute = String(
                    current.getMinutes()
                ).padStart(2, "0");
                const time = `${hour}:${minute}:00`;
                const key = `${schedule.id}_${time}`;
                slots.push({
                    schedule_id: schedule.id,
                    doctor_id: Number(doctorId),
                    date: schedule.schedule_date,
                    shift_type: schedule.shift_type,
                    time,
                    // Giờ đã đặt hoặc đã qua đều không còn trống
                    available:
                        !bookedSlots.has(key) &&
                        isFutureSlot(schedule.schedule_date, time)
                });
                current = new Date(
                    current.getTime() + SLOT_MINUTES * 60000
                );
            }
        }
        return res.json({
            success: true,
            data: slots
        });
    } catch (error) {
        console.error("GET AVAILABLE SLOTS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể lấy giờ khám."
        });
    }
}
// =====================================================
// 2. ĐẶT LỊCH KHÁM
//
// POST /api/appointments
// =====================================================

async function createAppointment(req, res) {
    const connection = await pool.getConnection();
    try {
        const user = getCurrentUser(req);
        // =================================================
        // PHẢI ĐĂNG NHẬP
        // =================================================
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Bạn cần đăng nhập trước khi đặt lịch."
            });
        }
        // =================================================
        // CHỈ BỆNH NHÂN ĐƯỢC ĐẶT LỊCH
        // =================================================
        if (user.role !== "PATIENT") {
            return res.status(403).json({
                success: false,
                message: "Tài khoản hiện tại không phải bệnh nhân."
            });
        }
        const {
            appointment_type = "SPECIALTY",
            doctor_id,
            schedule_id,
            appointment_time,
            reason,
            contact_name,
            contact_email,
            contact_phone,
            contact_address,
            sms_opt_in
        } = req.body || {};

        const appointmentType = String(appointment_type).trim().toUpperCase();

        if (!["GENERAL", "SPECIALTY"].includes(appointmentType)) {
            return res.status(400).json({
                success: false,
                message: "Loại khám không hợp lệ."
            });
        }
        const contactName = String(contact_name ?? "").trim();
        const contactEmail = String(contact_email ?? "")
            .trim()
            .toLowerCase();
        const contactPhone = normalizeVietnamPhone(contact_phone);
        const contactAddress = String(contact_address ?? "").trim();
        const smsOptIn =
            sms_opt_in === true ||
            sms_opt_in === 1 ||
            sms_opt_in === "1" ||
            sms_opt_in === "true";
        if (contactName.length < 2 || contactName.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Họ tên phải có từ 2 đến 100 ký tự."
            });
        }
        if (
            contactEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
        ) {
            return res.status(400).json({
                success: false,
                message: "Email người đặt không hợp lệ."
            });
        }
        if (!/^0\d{9}$/.test(contactPhone)) {
            return res.status(400).json({
                success: false,
                message: "Số điện thoại phải hợp lệ, ví dụ 0912345678."
            });
        }
        if (!contactAddress || contactAddress.length > 255) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập địa chỉ hợp lệ, tối đa 255 ký tự."
            });
        }
        // =================================================
        // BỆNH NHÂN LẤY TỪ SESSION
        // =================================================
        const patient_id = Number(user.id);
        if (
            !patient_id ||
            !doctor_id ||
            !schedule_id ||
            !appointment_time
        ) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập đầy đủ thông tin đặt lịch."
            });
        }
        // =================================================
        // NẾU FRONTEND CÒN GỬI patient_id
        // THÌ PHẢI KHỚP SESSION
        // =================================================
        if (
            req.body.patient_id &&
            Number(req.body.patient_id) !== patient_id
        ) {
            return res.status(403).json({
                success: false,
                message: "Thông tin bệnh nhân không hợp lệ."
            });
        }
        await connection.beginTransaction();
        // =================================================
        // KIỂM TRA BÁC SĨ
        // =================================================
        const [doctors] = await connection.query(
            `
            SELECT
                d.id,
                sp.name AS specialty_name
            FROM doctors d
            LEFT JOIN specialties sp
                ON sp.id = d.specialty_id
            WHERE d.id = ?
            LIMIT 1
            `,
            [Number(doctor_id)]
        );

        if (doctors.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy bác sĩ."
            });
        }

        // Không cho phép gửi loại khám GENERAL đến bác sĩ chuyên khoa khác
        // hoặc gửi SPECIALTY đến bác sĩ thuộc chuyên khoa Khám tổng quát.
        const isGeneralCheckupDoctor =
            String(doctors[0].specialty_name || "")
                .trim()
                .localeCompare("Khám tổng quát", "vi", {
                    sensitivity: "base"
                }) === 0;

        if (
            appointmentType === "GENERAL" &&
            !isGeneralCheckupDoctor
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Bạn đã chọn khám tổng quát. Vui lòng chọn bác sĩ thuộc chuyên khoa Khám tổng quát."
            });
        }

        if (
            appointmentType === "SPECIALTY" &&
            isGeneralCheckupDoctor
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Bác sĩ này thuộc chuyên khoa Khám tổng quát. Vui lòng chọn loại khám phù hợp."
            });
        }
        // =================================================
        // KHÓA VÀ KIỂM TRA LỊCH
        // =================================================
        const [schedules] = await connection.query(
            `
            SELECT
                id,
                doctor_id,
                schedule_date,
                shift_type,
                start_time,
                end_time,
                status,
                approval_status
            FROM schedules
            WHERE id = ?
              AND doctor_id = ?
            FOR UPDATE
            `,
            [Number(schedule_id), Number(doctor_id)]
        );
        if (schedules.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Lịch làm việc không tồn tại."
            });
        }
        const schedule = schedules[0];
        // =================================================
        // KIỂM TRA LỊCH ĐÃ ĐƯỢC ADMIN PHÊ DUYỆT
        // =================================================
        if (
            String(schedule.approval_status || "").toUpperCase() !==
            "APPROVED"
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Lịch khám chưa được admin phê duyệt."
            });
        }
        // =================================================
        // KIỂM TRA LỊCH CÒN MỞ
        // =================================================
        if (schedule.status !== "AVAILABLE") {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Lịch khám này hiện không khả dụng."
            });
        }
        // =================================================
        // KIỂM TRA GIỜ NẰM TRONG CA
        // =================================================
        if (
            appointment_time < schedule.start_time ||
            appointment_time >= schedule.end_time
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
        const timeParts = String(appointment_time).split(":");
        const appointmentHour = Number(timeParts[0]);
        const appointmentMinute = Number(timeParts[1]);
        if (
            Number.isNaN(appointmentHour) ||
            Number.isNaN(appointmentMinute) ||
            !(appointmentMinute === 0 || appointmentMinute === 30)
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Giờ khám không hợp lệ."
            });
        }
        // =================================================
        // KIỂM TRA BỆNH NHÂN TRÙNG LỊCH
        // =================================================
        const [patientExisting] = await connection.query(
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
        if (patientExisting.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: "Bạn đã có một lịch khám vào thời gian này."
            });
        }
        // =================================================
        // KIỂM TRA GIỜ CỦA BÁC SĨ ĐÃ BỊ ĐẶT
        // =================================================
        const [doctorExisting] = await connection.query(
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
        if (doctorExisting.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: "Giờ khám này đã được đặt."
            });
        }
        // =================================================
        // TẠO LỊCH HẸN
        // =================================================
        const [result] = await connection.query(
            `
            INSERT INTO appointments (
                patient_id,
                appointment_type,
                doctor_id,
                schedule_id,
                appointment_time,
                reason,
                contact_name,
                contact_email,
                contact_phone,
                contact_address,
                sms_opt_in,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
            `,
            [
                patient_id,
                appointmentType,
                Number(doctor_id),
                Number(schedule_id),
                appointment_time,
                reason ? String(reason).trim() : null,
                contactName,
                contactEmail,
                contactPhone,
                contactAddress,
                smsOptIn ? 1 : 0
            ]
        );
        await connection.commit();
        const appointmentId = Number(result.insertId);
        let bookingSmsSent = false;
        let smsMessage = "";
        if (smsOptIn) {
            if (!isSmsConfigured()) {
                smsMessage =
                    " Chưa gửi được SMS vì hệ thống chưa có cấu hình SMS hợp lệ.";
                console.warn(
                    "BOOKING SMS SKIPPED: eSMS chưa được cấu hình."
                );
            } else {
                try {
                    const smsContent =
                        `Clinic Booking: Da tiep nhan yeu cau dat lich ` +
                        `cua ${contactName}. Ngay ` +
                        `${formatDateDisplay(schedule.schedule_date)}, luc ` +
                        `${String(appointment_time).slice(0, 5)}. ` +
                        `Lich dang cho xac nhan. Ma lich ${appointmentId}.`;
                    await sendSms(contactPhone, smsContent);
                    if (!isSmsSandbox()) {
                        await pool.query(
                            `
                            UPDATE appointments
                            SET booking_sms_sent = 1
                            WHERE id = ?
                            `,
                            [appointmentId]
                        );
                        bookingSmsSent = true;
                        smsMessage =
                            " Yêu cầu SMS đã được nhà cung cấp tiếp nhận.";
                    } else {
                        smsMessage =
                            " Hệ thống đang ở chế độ Sandbox nên không gửi SMS thật.";
                    }
                } catch (smsError) {
                    console.error(
                        "BOOKING SMS FAILED:",
                        smsError.message
                    );
                    smsMessage =
                        " Lịch đã lưu nhưng gửi SMS thất bại; hãy kiểm tra log Backend.";
                }
            }
        } else {
            smsMessage = " Bạn chưa chọn nhận thông báo SMS.";
        }
        return res.status(201).json({
            success: true,
            message: "Đặt lịch khám thành công." + smsMessage,
            data: {
                id: appointmentId,
                patient_id,
                appointment_type: appointmentType,
                doctor_id: Number(doctor_id),
                schedule_id: Number(schedule_id),
                appointment_time,
                reason: reason ? String(reason).trim() : null,
                contact_name: contactName,
                contact_email: contactEmail,
                contact_phone: contactPhone,
                contact_address: contactAddress,
                sms_opt_in: smsOptIn,
                booking_sms_sent: bookingSmsSent,
                status: "PENDING"
            }
        });
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error("ROLLBACK ERROR:", rollbackError);
        }
        console.error("CREATE APPOINTMENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể đặt lịch khám."
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

async function getPatientAppointments(req, res) {
    try {
        const user = getCurrentUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Bạn chưa đăng nhập."
            });
        }
        const patientId = Number(req.params.patientId);
        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: "ID bệnh nhân không hợp lệ."
            });
        }
        // =================================================
        // BỆNH NHÂN CHỈ ĐƯỢC XEM LỊCH CỦA MÌNH
        // ADMIN CÓ THỂ XEM
        // =================================================
        if (
            user.role !== "ADMIN" &&
            Number(user.id) !== patientId
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền xem lịch của bệnh nhân này."
            });
        }
        const [rows] = await pool.query(
            `
            SELECT
                a.id,
                a.patient_id,
                a.appointment_type,
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
            [patientId]
        );
        return res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error("GET PATIENT APPOINTMENTS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể lấy lịch khám."
        });
    }
}
// =====================================================
// 4. HỦY LỊCH KHÁM CỦA BỆNH NHÂN
//
// PATCH /api/appointments/:id/cancel
// =====================================================

async function cancelAppointment(req, res) {
    try {
        const user = getCurrentUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Bạn chưa đăng nhập."
            });
        }
        if (user.role !== "PATIENT" && user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền hủy lịch."
            });
        }
        const appointmentId = Number(req.params.id);
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "ID lịch hẹn không hợp lệ."
            });
        }
        const [appointments] = await pool.query(
            `
            SELECT
                id,
                patient_id,
                status
            FROM appointments
            WHERE id = ?
            LIMIT 1
            `,
            [appointmentId]
        );
        if (appointments.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy lịch hẹn."
            });
        }
        const appointment = appointments[0];
        if (
            user.role !== "ADMIN" &&
            Number(appointment.patient_id) !== Number(user.id)
        ) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền hủy lịch hẹn này."
            });
        }
        if (
            appointment.status !== "PENDING" &&
            appointment.status !== "CONFIRMED"
        ) {
            return res.status(400).json({
                success: false,
                message: "Lịch hẹn hiện tại không thể hủy."
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
            [appointmentId]
        );
        return res.json({
            success: true,
            message: "Đã hủy lịch khám."
        });
    } catch (error) {
        console.error("CANCEL APPOINTMENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể hủy lịch."
        });
    }
}
// =====================================================
// 5. ĐỔI LỊCH KHÁM
//
// PATCH /api/appointments/:id/reschedule
//
// Body (nhận cả hai kiểu tên trường):
// {
//   "schedule_id": 12,            // hoặc new_schedule_id
//   "appointment_time": "09:30",  // hoặc new_appointment_time
//   "doctor_id": 3                // hoặc new_doctor_id (không bắt buộc,
//                                 // mặc định giữ bác sĩ cũ)
// }
// =====================================================

async function rescheduleAppointment(req, res) {
    const connection = await pool.getConnection();
    try {
        const user = getCurrentUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Bạn chưa đăng nhập."
            });
        }
        if (user.role !== "PATIENT" && user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền đổi lịch."
            });
        }
        const appointmentId = Number(req.params.id);
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "ID lịch hẹn không hợp lệ."
            });
        }
        const newScheduleId = Number(
            req.body?.new_schedule_id ?? req.body?.schedule_id
        );
        const newTime = normalizeTime(
            req.body?.new_appointment_time ??
            req.body?.appointment_time
        );
        if (!newScheduleId || !newTime) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng chọn ca khám và giờ khám mới."
            });
        }
        await connection.beginTransaction();
        // =================================================
        // KHÓA LỊCH HẸN HIỆN TẠI
        // =================================================
        const [appointments] = await connection.query(
            `
            SELECT
                a.id,
                a.patient_id,
                a.doctor_id,
                a.schedule_id,
                a.appointment_time,
                a.status,
                a.actual_arrival_time,
                a.contact_name,
                a.contact_phone,
                a.sms_opt_in,
                s.schedule_date AS old_schedule_date
            FROM appointments a
            INNER JOIN schedules s
                ON s.id = a.schedule_id
            WHERE a.id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [appointmentId]
        );
        if (appointments.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy lịch hẹn."
            });
        }
        const appointment = appointments[0];
        // Bệnh nhân chỉ được đổi lịch của mình
        if (
            user.role !== "ADMIN" &&
            Number(appointment.patient_id) !== Number(user.id)
        ) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền đổi lịch hẹn này."
            });
        }
        if (
            appointment.status !== "PENDING" &&
            appointment.status !== "CONFIRMED"
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Chỉ lịch PENDING hoặc CONFIRMED mới có thể đổi."
            });
        }
        if (appointment.actual_arrival_time) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Bệnh nhân đã đến khám nên không thể đổi lịch."
            });
        }
        // Lịch cũ đã qua thì không cho đổi
        if (
            !isFutureSlot(
                appointment.old_schedule_date,
                appointment.appointment_time
            )
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Lịch hẹn cũ đã qua nên không thể đổi."
            });
        }
        const requestedDoctorId =
            req.body?.new_doctor_id ?? req.body?.doctor_id;
        const newDoctorId = requestedDoctorId
            ? Number(requestedDoctorId)
            : Number(appointment.doctor_id);
        // =================================================
        // KHÓA CA LÀM VIỆC MỚI
        // =================================================
        const [schedules] = await connection.query(
            `
            SELECT
                id,
                doctor_id,
                schedule_date,
                shift_type,
                start_time,
                end_time,
                status,
                approval_status
            FROM schedules
            WHERE id = ?
              AND doctor_id = ?
            FOR UPDATE
            `,
            [newScheduleId, newDoctorId]
        );
        if (schedules.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Lịch làm việc mới không tồn tại."
            });
        }
        const schedule = schedules[0];
        if (
            String(schedule.approval_status || "").toUpperCase() !==
            "APPROVED"
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Lịch khám mới chưa được admin phê duyệt."
            });
        }
        if (schedule.status !== "AVAILABLE") {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Lịch khám mới hiện không khả dụng."
            });
        }
        // Không được chọn lại đúng khung giờ cũ
        if (
            Number(appointment.schedule_id) === newScheduleId &&
            normalizeTime(appointment.appointment_time) === newTime
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Giờ khám mới trùng với lịch hiện tại."
            });
        }
        // Giờ phải nằm trong ca
        if (
            newTime < schedule.start_time ||
            newTime >= schedule.end_time
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Giờ khám không nằm trong lịch làm việc của bác sĩ."
            });
        }
        // Phải đúng mốc 30 phút
        const minute = Number(newTime.split(":")[1]);
        if (minute !== 0 && minute !== 30) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Giờ khám không hợp lệ."
            });
        }
        // Giờ mới phải ở tương lai
        if (!isFutureSlot(schedule.schedule_date, newTime)) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Không thể đổi sang thời điểm đã qua."
            });
        }
        // =================================================
        // BÁC SĨ ĐÃ CÓ NGƯỜI ĐẶT GIỜ MỚI? (loại trừ chính lịch này)
        // =================================================
        const [doctorExisting] = await connection.query(
            `
            SELECT id
            FROM appointments
            WHERE doctor_id = ?
              AND schedule_id = ?
              AND appointment_time = ?
              AND status <> 'CANCELLED'
              AND id <> ?
            LIMIT 1
            `,
            [newDoctorId, newScheduleId, newTime, appointmentId]
        );
        if (doctorExisting.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: "Giờ khám mới này đã được đặt."
            });
        }
        // =================================================
        // BỆNH NHÂN TRÙNG LỊCH KHÁC? (loại trừ chính lịch này)
        // =================================================
        const [patientExisting] = await connection.query(
            `
            SELECT a.id
            FROM appointments a
            INNER JOIN schedules s
                ON s.id = a.schedule_id
            WHERE a.patient_id = ?
              AND s.schedule_date = ?
              AND a.appointment_time = ?
              AND a.status <> 'CANCELLED'
              AND a.id <> ?
            LIMIT 1
            `,
            [
                appointment.patient_id,
                getDateKey(schedule.schedule_date),
                newTime,
                appointmentId
            ]
        );
        if (patientExisting.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: "Bạn đã có một lịch khám khác vào thời gian này."
            });
        }
        // =================================================
        // CẬP NHẬT LỊCH HẸN
        // Đổi lịch xong phải chờ bác sĩ xác nhận lại.
        // =================================================
        const oldDateDisplay = formatDateDisplay(
            appointment.old_schedule_date
        );
        const oldTimeDisplay = String(
            appointment.appointment_time
        ).slice(0, 5);
        await connection.query(
            `
            UPDATE appointments
            SET
                doctor_id = ?,
                schedule_id = ?,
                appointment_time = ?,
                status = 'PENDING',
                confirmation_sms_sent = 0,
                note = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                newDoctorId,
                newScheduleId,
                newTime,
                `Đổi lịch từ ${oldDateDisplay} ${oldTimeDisplay}`,
                appointmentId
            ]
        );
        await connection.commit();
        // =================================================
        // GỬI SMS (không ảnh hưởng kết quả đổi lịch)
        // =================================================
        let smsMessage = "";
        if (
            Number(appointment.sms_opt_in) === 1 &&
            appointment.contact_phone &&
            isSmsConfigured()
        ) {
            try {
                const smsContent =
                    `Clinic Booking: Lich kham cua ` +
                    `${appointment.contact_name} da doi sang ngay ` +
                    `${formatDateDisplay(schedule.schedule_date)}, luc ` +
                    `${newTime.slice(0, 5)}. ` +
                    `Lich dang cho xac nhan. Ma lich ${appointmentId}.`;
                await sendSms(appointment.contact_phone, smsContent);
                smsMessage = isSmsSandbox()
                    ? " Hệ thống đang ở chế độ Sandbox nên không gửi SMS thật."
                    : " Yêu cầu SMS đã được nhà cung cấp tiếp nhận.";
            } catch (smsError) {
                console.error(
                    "RESCHEDULE SMS FAILED:",
                    smsError.message
                );
                smsMessage = " Đổi lịch thành công nhưng gửi SMS thất bại.";
            }
        }
        return res.json({
            success: true,
            message:
                "Đổi lịch khám thành công, lịch đang chờ bác sĩ xác nhận lại." +
                smsMessage,
            data: {
                id: appointmentId,
                doctor_id: newDoctorId,
                schedule_id: newScheduleId,
                appointment_time: newTime,
                schedule_date: getDateKey(schedule.schedule_date),
                status: "PENDING"
            }
        });
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error("ROLLBACK ERROR:", rollbackError);
        }
        console.error("RESCHEDULE APPOINTMENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể đổi lịch khám."
        });
    } finally {
        connection.release();
    }
}
// =====================================================
// HELPER: KIỂM TRA BÁC SĨ CÓ QUYỀN VỚI APPOINTMENT
// =====================================================

async function getDoctorAppointment(appointmentId, user) {
    if (!user) {
        return {
            error: {
                status: 401,
                message: "Bạn chưa đăng nhập."
            }
        };
    }
    if (user.role !== "DOCTOR" && user.role !== "ADMIN") {
        return {
            error: {
                status: 403,
                message: "Bạn không có quyền xử lý lịch hẹn."
            }
        };
    }
    const [rows] = await pool.query(
        `
        SELECT
            a.id,
            a.patient_id,
            a.doctor_id,
            a.schedule_id,
            a.appointment_time,
            a.status,
            a.actual_arrival_time,
            a.contact_name,
            a.contact_phone,
            a.sms_opt_in,
            s.schedule_date
        FROM appointments a
        INNER JOIN schedules s
            ON s.id = a.schedule_id
        WHERE a.id = ?
        LIMIT 1
        `,
        [appointmentId]
    );
    if (rows.length === 0) {
        return {
            error: {
                status: 404,
                message: "Không tìm thấy lịch hẹn."
            }
        };
    }
    const appointment = rows[0];
    if (user.role === "DOCTOR") {
        const doctorId = await getDoctorIdFromUser(user);
        if (!doctorId) {
            return {
                error: {
                    status: 403,
                    message:
                        "Tài khoản bác sĩ chưa được liên kết với hồ sơ bác sĩ."
                }
            };
        }
        if (Number(appointment.doctor_id) !== Number(doctorId)) {
            return {
                error: {
                    status: 403,
                    message: "Bạn không có quyền xử lý lịch hẹn này."
                }
            };
        }
    }
    return { appointment };
}
// =====================================================
// 6. BÁC SĨ XÁC NHẬN LỊCH
//
// POST /api/appointments/:id/confirm
// =====================================================

async function confirmAppointment(req, res) {
    try {
        const appointmentId = Number(req.params.id);
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "ID lịch khám không hợp lệ."
            });
        }
        const check = await getDoctorAppointment(
            appointmentId,
            getCurrentUser(req)
        );
        if (check.error) {
            return res.status(check.error.status).json({
                success: false,
                message: check.error.message
            });
        }
        const appointment = check.appointment;
        if (appointment.status !== "PENDING") {
            return res.status(400).json({
                success: false,
                message: "Chỉ lịch khám PENDING mới có thể xác nhận."
            });
        }
        // Lịch đã quá giờ khám thì không còn xác nhận được nữa
        if (
            !isFutureSlot(
                appointment.schedule_date,
                appointment.appointment_time
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Lịch khám đã quá giờ nên không thể xác nhận. " +
                    "Hệ thống sẽ tự động hủy lịch này."
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
            [appointmentId]
        );
        let confirmationSmsSent = false;
        try {
            const [rows] = await pool.query(
                `
                SELECT
                    a.id,
                    a.contact_name,
                    a.contact_phone,
                    a.sms_opt_in,
                    a.confirmation_sms_sent,
                    DATE_FORMAT(
                        s.schedule_date,
                        '%d/%m/%Y'
                    ) AS appointment_date_display,
                    TIME_FORMAT(
                        a.appointment_time,
                        '%H:%i'
                    ) AS appointment_time_display,
                    du.full_name AS doctor_name
                FROM appointments a
                INNER JOIN schedules s
                    ON s.id = a.schedule_id
                INNER JOIN doctors d
                    ON d.id = a.doctor_id
                INNER JOIN users du
                    ON du.id = d.user_id
                WHERE a.id = ?
                LIMIT 1
                `,
                [appointmentId]
            );
            const detail = rows[0];
            const optedIn = Number(detail?.sms_opt_in) === 1;
            const alreadySent =
                Number(detail?.confirmation_sms_sent) === 1;
            if (
                detail &&
                optedIn &&
                detail.contact_phone &&
                !alreadySent &&
                isSmsConfigured()
            ) {
                const smsContent =
                    `Clinic Booking: Lich kham cua ` +
                    `${detail.contact_name} da duoc xac nhan. ` +
                    `Ngay ${detail.appointment_date_display}, luc ` +
                    `${detail.appointment_time_display}, voi BS ` +
                    `${detail.doctor_name}.`;
                await sendSms(detail.contact_phone, smsContent);
                if (!isSmsSandbox()) {
                    await pool.query(
                        `
                        UPDATE appointments
                        SET confirmation_sms_sent = 1
                        WHERE id = ?
                        `,
                        [appointmentId]
                    );
                    confirmationSmsSent = true;
                }
            }
        } catch (smsError) {
            console.error(
                "APPOINTMENT CONFIRMATION SMS FAILED:",
                smsError.message
            );
        }
        return res.json({
            success: true,
            message: confirmationSmsSent
                ? "Xác nhận lịch khám thành công. Yêu cầu SMS xác nhận đã được tiếp nhận."
                : "Xác nhận lịch khám thành công. SMS chưa được gửi hoặc đang ở chế độ thử nghiệm."
        });
    } catch (error) {
        console.error("CONFIRM APPOINTMENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi máy chủ khi xác nhận lịch khám."
        });
    }
}
// =====================================================
// 7. GHI NHẬN BỆNH NHÂN ĐẾN KHÁM
//
// POST /api/appointments/:id/arrival
// =====================================================

async function recordArrival(req, res) {
    try {
        const appointmentId = Number(req.params.id);
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "ID lịch khám không hợp lệ."
            });
        }
        const check = await getDoctorAppointment(
            appointmentId,
            getCurrentUser(req)
        );
        if (check.error) {
            return res.status(check.error.status).json({
                success: false,
                message: check.error.message
            });
        }
        const appointment = check.appointment;
        if (appointment.status !== "CONFIRMED") {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch khám CONFIRMED mới có thể ghi nhận đến khám."
            });
        }
        if (appointment.actual_arrival_time) {
            return res.status(400).json({
                success: false,
                message: "Bệnh nhân đã được ghi nhận đến khám."
            });
        }
        // =================================================
        // THỜI GIAN HIỆN TẠI
        // =================================================
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const [appointmentHour, appointmentMinute] = String(
            appointment.appointment_time
        )
            .split(":")
            .map(Number);
        const currentTotalMinutes = currentHour * 60 + currentMinute;
        const appointmentTotalMinutes =
            appointmentHour * 60 + appointmentMinute;
        const lateMinutes = Math.max(
            0,
            currentTotalMinutes - appointmentTotalMinutes
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
            [actualArrivalTime, lateMinutes, appointmentId]
        );
        return res.json({
            success: true,
            message:
                lateMinutes > 0
                    ? `Bệnh nhân đã đến muộn ${lateMinutes} phút.`
                    : "Bệnh nhân đã đến đúng giờ.",
            data: {
                actual_arrival_time: actualArrivalTime,
                late_minutes: lateMinutes
            }
        });
    } catch (error) {
        console.error("RECORD ARRIVAL ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi máy chủ khi ghi nhận bệnh nhân đến."
        });
    }
}
// =====================================================
// 8. ĐÁNH DẤU KHÔNG ĐẾN
//
// POST /api/appointments/:id/no-show
// =====================================================

async function markNoShow(req, res) {
    try {
        const appointmentId = Number(req.params.id);
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "ID lịch khám không hợp lệ."
            });
        }
        const check = await getDoctorAppointment(
            appointmentId,
            getCurrentUser(req)
        );
        if (check.error) {
            return res.status(check.error.status).json({
                success: false,
                message: check.error.message
            });
        }
        const appointment = check.appointment;
        if (appointment.status !== "CONFIRMED") {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch khám CONFIRMED mới có thể đánh dấu không đến."
            });
        }
        if (appointment.actual_arrival_time) {
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
                note = COALESCE(
                    note,
                    'Bệnh nhân không đến khám'
                ),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [appointmentId]
        );
        return res.json({
            success: true,
            message: "Đã đánh dấu bệnh nhân không đến khám."
        });
    } catch (error) {
        console.error("NO SHOW ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi máy chủ khi xử lý NO_SHOW."
        });
    }
}
// =====================================================
// 9. HOÀN THÀNH KHÁM
//
// POST /api/appointments/:id/complete
// =====================================================

async function completeAppointment(req, res) {
    try {
        const appointmentId = Number(req.params.id);
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "ID lịch khám không hợp lệ."
            });
        }
        const check = await getDoctorAppointment(
            appointmentId,
            getCurrentUser(req)
        );
        if (check.error) {
            return res.status(check.error.status).json({
                success: false,
                message: check.error.message
            });
        }
        const appointment = check.appointment;
        if (appointment.status !== "CONFIRMED") {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch khám CONFIRMED mới có thể hoàn thành."
            });
        }
        if (!appointment.actual_arrival_time) {
            return res.status(400).json({
                success: false,
                message: "Chưa ghi nhận bệnh nhân đến khám."
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
            [appointmentId]
        );
        return res.json({
            success: true,
            message: "Cuộc hẹn đã được đánh dấu hoàn thành."
        });
    } catch (error) {
        console.error("COMPLETE APPOINTMENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi máy chủ khi hoàn thành cuộc hẹn."
        });
    }
}
// =====================================================
// HELPER: GỬI SMS THÔNG BÁO HỦY LỊCH
// Không ném lỗi: SMS lỗi không được làm hỏng việc hủy lịch.
// Trả về true nếu SMS thật đã được nhà cung cấp tiếp nhận.
// =====================================================

async function sendCancellationSms({
    name,
    phone,
    smsOptIn,
    dateDisplay,
    timeDisplay,
    byDoctor
}) {
    if (
        Number(smsOptIn) !== 1 ||
        !phone ||
        !isSmsConfigured()
    ) {
        return false;
    }
    try {
        const smsContent =
            `Clinic Booking: Lich kham cua ${name} ` +
            `ngay ${dateDisplay}, luc ${timeDisplay} ` +
            (byDoctor
                ? "da bi bac si huy. "
                : "da bi huy do bac si chua xac nhan. ") +
            "Vui long dat lich khac.";
        await sendSms(phone, smsContent);
        return !isSmsSandbox();
    } catch (smsError) {
        console.error(
            "CANCELLATION SMS FAILED:",
            smsError.message
        );
        return false;
    }
}
// =====================================================
// 10. TỰ ĐỘNG HỦY LỊCH PENDING ĐÃ QUÁ GIỜ KHÁM
//
// Lịch vẫn PENDING (bác sĩ chưa duyệt) mà đã đến/qua
// giờ hẹn thì chuyển sang CANCELLED.
// Được gọi định kỳ bởi appointment.job.js.
// Trả về số lịch đã hủy.
// =====================================================
// Số phút "châm chước" sau giờ hẹn mới hủy (0 = hủy ngay khi đến giờ)
const AUTO_CANCEL_GRACE_MINUTES = 0;

const AUTO_CANCEL_NOTE =
    "Tự động hủy: bác sĩ không xác nhận trước giờ khám";

function toSqlDateTime(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-` +
        `${pad(date.getDate())} ${pad(date.getHours())}:` +
        `${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
}

async function autoCancelExpiredAppointments() {
    // Dùng giờ server (cùng cách isFutureSlot so sánh),
    // không phụ thuộc múi giờ của MySQL.
    const threshold = toSqlDateTime(
        new Date(
            Date.now() - AUTO_CANCEL_GRACE_MINUTES * 60000
        )
    );
    const [expired] = await pool.query(
        `
        SELECT
            a.id,
            a.contact_name,
            a.contact_phone,
            a.sms_opt_in,
            DATE_FORMAT(
                s.schedule_date,
                '%d/%m/%Y'
            ) AS date_display,
            TIME_FORMAT(
                a.appointment_time,
                '%H:%i'
            ) AS time_display
        FROM appointments a
        INNER JOIN schedules s
            ON s.id = a.schedule_id
        WHERE a.status = 'PENDING'
          AND TIMESTAMP(s.schedule_date, a.appointment_time) <= ?
        ORDER BY a.id ASC
        LIMIT 200
        `,
        [threshold]
    );
    let cancelled = 0;
    for (const item of expired) {
        // Điều kiện status = 'PENDING' chống lại trường hợp
        // bác sĩ vừa xác nhận đúng lúc job chạy.
        const [result] = await pool.query(
            `
            UPDATE appointments
            SET
                status = 'CANCELLED',
                note = CONCAT_WS(' | ', NULLIF(note, ''), ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND status = 'PENDING'
            `,
            [AUTO_CANCEL_NOTE, item.id]
        );
        if (result.affectedRows !== 1) {
            continue;
        }
        cancelled++;
        await sendCancellationSms({
            name: item.contact_name,
            phone: item.contact_phone,
            smsOptIn: item.sms_opt_in,
            dateDisplay: item.date_display,
            timeDisplay: item.time_display,
            byDoctor: false
        });
    }
    return cancelled;
}
// =====================================================
// 11. BÁC SĨ HỦY LỊCH
//
// POST /api/appointments/:id/doctor-cancel
//
// Body:
// {
//   "reason": "Bác sĩ có việc đột xuất"   // bắt buộc, 5-200 ký tự
// }
// =====================================================

async function doctorCancelAppointment(req, res) {
    try {
        const appointmentId = Number(req.params.id);
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "ID lịch khám không hợp lệ."
            });
        }
        const reason = String(req.body?.reason ?? "").trim();
        if (reason.length < 5 || reason.length > 200) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập lý do hủy lịch (từ 5 đến 200 ký tự)."
            });
        }
        const check = await getDoctorAppointment(
            appointmentId,
            getCurrentUser(req)
        );
        if (check.error) {
            return res.status(check.error.status).json({
                success: false,
                message: check.error.message
            });
        }
        const appointment = check.appointment;
        if (
            appointment.status !== "PENDING" &&
            appointment.status !== "CONFIRMED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch PENDING hoặc CONFIRMED mới có thể hủy."
            });
        }
        if (appointment.actual_arrival_time) {
            return res.status(400).json({
                success: false,
                message:
                    "Bệnh nhân đã đến khám nên không thể hủy lịch."
            });
        }
        // Lý do được lưu vào note để bệnh nhân thấy ở trang lịch hẹn
        const [result] = await pool.query(
            `
            UPDATE appointments
            SET
                status = 'CANCELLED',
                note = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND status IN ('PENDING', 'CONFIRMED')
              AND actual_arrival_time IS NULL
            `,
            [`Bác sĩ hủy lịch: ${reason}`, appointmentId]
        );
        if (result.affectedRows !== 1) {
            return res.status(409).json({
                success: false,
                message:
                    "Lịch hẹn vừa được cập nhật, vui lòng tải lại danh sách."
            });
        }
        const smsSent = await sendCancellationSms({
            name: appointment.contact_name,
            phone: appointment.contact_phone,
            smsOptIn: appointment.sms_opt_in,
            dateDisplay: formatDateDisplay(
                appointment.schedule_date
            ),
            timeDisplay: String(
                appointment.appointment_time
            ).slice(0, 5),
            byDoctor: true
        });
        return res.json({
            success: true,
            message: smsSent
                ? "Đã hủy lịch khám và gửi SMS thông báo cho bệnh nhân."
                : "Đã hủy lịch khám.",
            data: {
                id: appointmentId,
                status: "CANCELLED"
            }
        });
    } catch (error) {
        console.error("DOCTOR CANCEL APPOINTMENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi máy chủ khi hủy lịch khám."
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
    rescheduleAppointment,
    confirmAppointment,
    recordArrival,
    markNoShow,
    completeAppointment,
    doctorCancelAppointment,
    autoCancelExpiredAppointments
};