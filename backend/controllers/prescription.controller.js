const { pool } = require("../config/db");

// =====================================================
// HELPER
// =====================================================

function getCurrentUser(req) {
    return req.session?.user || req.user || null;
}

async function getDoctorIdFromUser(user) {
    if (!user?.id) return null;

    const [rows] = await pool.query(
        `SELECT id FROM doctors WHERE user_id = ? LIMIT 1`,
        [user.id]
    );

    return rows.length ? rows[0].id : null;
}

function todayKey() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");
}

// Chuỗi rỗng -> null; vượt quá độ dài -> ném lỗi có message
function optionalText(value, max, label) {
    const text = String(value ?? "").trim();

    if (!text) return null;

    if (text.length > max) {
        const error = new Error(
            `${label} không được vượt quá ${max} ký tự.`
        );
        error.isValidation = true;
        throw error;
    }

    return text;
}

const MAX_ITEMS = 30;

function parseItems(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        const error = new Error(
            "Đơn thuốc phải có ít nhất một loại thuốc."
        );
        error.isValidation = true;
        throw error;
    }

    if (rawItems.length > MAX_ITEMS) {
        const error = new Error(
            `Một đơn thuốc tối đa ${MAX_ITEMS} loại thuốc.`
        );
        error.isValidation = true;
        throw error;
    }

    return rawItems.map((item, index) => {
        const position = `Thuốc #${index + 1}`;
        const medicineName = optionalText(
            item?.medicine_name, 255, `${position}: tên thuốc`
        );

        if (!medicineName) {
            const error = new Error(
                `${position}: vui lòng nhập tên thuốc.`
            );
            error.isValidation = true;
            throw error;
        }

        return [
            medicineName,
            optionalText(item?.dosage, 150, `${position}: liều dùng`),
            optionalText(item?.frequency, 150, `${position}: tần suất`),
            optionalText(item?.duration, 100, `${position}: thời gian dùng`),
            optionalText(item?.quantity, 100, `${position}: số lượng`),
            optionalText(item?.instructions, 1000, `${position}: hướng dẫn`)
        ];
    });
}

// =====================================================
// KÊ ĐƠN / SỬA ĐƠN (dùng chung)
//
// POST /api/appointments/:id/prescription  -> tạo mới
// PUT  /api/appointments/:id/prescription  -> thay thế nội dung
//
// Body:
// {
//   "diagnosis": "Viêm họng cấp",          // bắt buộc
//   "symptoms": "...", "examination_notes": "...",
//   "treatment_plan": "...", "note": "Lời dặn chung",
//   "items": [
//     { "medicine_name": "Paracetamol 500mg", "dosage": "1 viên",
//       "frequency": "3 lần/ngày", "duration": "5 ngày",
//       "quantity": "15 viên", "instructions": "Uống sau ăn" }
//   ]
// }
// =====================================================

async function savePrescription(req, res, isUpdate) {
    const connection = await pool.getConnection();

    try {
        const user = getCurrentUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Bạn chưa đăng nhập."
            });
        }

        if (user.role !== "DOCTOR") {
            return res.status(403).json({
                success: false,
                message: "Chỉ bác sĩ mới được kê đơn thuốc."
            });
        }

        const appointmentId = Number(req.params.id);

        if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
            return res.status(400).json({
                success: false,
                message: "ID lịch khám không hợp lệ."
            });
        }

        const doctorId = await getDoctorIdFromUser(user);

        if (!doctorId) {
            return res.status(403).json({
                success: false,
                message:
                    "Tài khoản bác sĩ chưa được liên kết với hồ sơ bác sĩ."
            });
        }

        // ---------- Kiểm tra dữ liệu đầu vào ----------
        let diagnosis, symptoms, examinationNotes,
            treatmentPlan, note, itemRows;

        try {
            diagnosis = optionalText(req.body?.diagnosis, 500, "Chẩn đoán");
            symptoms = optionalText(req.body?.symptoms, 5000, "Triệu chứng");
            examinationNotes = optionalText(
                req.body?.examination_notes, 5000, "Ghi chú khám"
            );
            treatmentPlan = optionalText(
                req.body?.treatment_plan, 5000, "Hướng điều trị"
            );
            note = optionalText(req.body?.note, 2000, "Lời dặn");
            itemRows = parseItems(req.body?.items);
        } catch (validationError) {
            if (validationError.isValidation) {
                return res.status(400).json({
                    success: false,
                    message: validationError.message
                });
            }
            throw validationError;
        }

        if (!diagnosis) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập chẩn đoán."
            });
        }

        await connection.beginTransaction();

        // ---------- Khóa và kiểm tra lịch hẹn ----------
        const [appointments] = await connection.query(
            `
            SELECT id, patient_id, doctor_id, status, actual_arrival_time
            FROM appointments
            WHERE id = ?
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

        if (Number(appointment.doctor_id) !== Number(doctorId)) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền kê đơn cho lịch hẹn này."
            });
        }

        const canPrescribe =
            appointment.status === "COMPLETED" ||
            (appointment.status === "CONFIRMED" &&
                appointment.actual_arrival_time);

        if (!canPrescribe) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ có thể kê đơn khi bệnh nhân đã đến khám hoặc cuộc khám đã hoàn thành."
            });
        }

        // ---------- Hồ sơ bệnh án (1 lịch hẹn = 1 hồ sơ) ----------
        const [records] = await connection.query(
            `
            SELECT id
            FROM medical_records
            WHERE appointment_id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [appointmentId]
        );

        let medicalRecordId;

        if (records.length === 0) {
            const [inserted] = await connection.query(
                `
                INSERT INTO medical_records (
                    appointment_id, patient_id, doctor_id,
                    diagnosis, symptoms, examination_notes, treatment_plan
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    appointmentId,
                    appointment.patient_id,
                    appointment.doctor_id,
                    diagnosis,
                    symptoms,
                    examinationNotes,
                    treatmentPlan
                ]
            );
            medicalRecordId = Number(inserted.insertId);
        } else {
            medicalRecordId = Number(records[0].id);

            await connection.query(
                `
                UPDATE medical_records
                SET
                    diagnosis = ?,
                    symptoms = ?,
                    examination_notes = ?,
                    treatment_plan = ?
                WHERE id = ?
                `,
                [
                    diagnosis,
                    symptoms,
                    examinationNotes,
                    treatmentPlan,
                    medicalRecordId
                ]
            );
        }

        // ---------- Đơn thuốc ----------
        const [prescriptions] = await connection.query(
            `
            SELECT id
            FROM prescriptions
            WHERE medical_record_id = ?
            ORDER BY id ASC
            LIMIT 1
            FOR UPDATE
            `,
            [medicalRecordId]
        );

        let prescriptionId;

        if (isUpdate) {
            if (prescriptions.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: "Lịch khám này chưa có đơn thuốc để cập nhật."
                });
            }

            prescriptionId = Number(prescriptions[0].id);

            await connection.query(
                `UPDATE prescriptions SET note = ? WHERE id = ?`,
                [note, prescriptionId]
            );

            await connection.query(
                `DELETE FROM prescription_items WHERE prescription_id = ?`,
                [prescriptionId]
            );
        } else {
            if (prescriptions.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message:
                        "Lịch khám này đã có đơn thuốc. Hãy dùng chức năng sửa đơn."
                });
            }

            const [inserted] = await connection.query(
                `
                INSERT INTO prescriptions (
                    medical_record_id, prescription_date, note
                )
                VALUES (?, ?, ?)
                `,
                [medicalRecordId, todayKey(), note]
            );
            prescriptionId = Number(inserted.insertId);
        }

        await connection.query(
            `
            INSERT INTO prescription_items (
                prescription_id, medicine_name, dosage,
                frequency, duration, quantity, instructions
            )
            VALUES ?
            `,
            [itemRows.map(row => [prescriptionId, ...row])]
        );

        await connection.commit();

        return res.status(isUpdate ? 200 : 201).json({
            success: true,
            message: isUpdate
                ? "Đã cập nhật đơn thuốc."
                : "Kê đơn thuốc thành công.",
            data: {
                prescription_id: prescriptionId,
                medical_record_id: medicalRecordId,
                appointment_id: appointmentId,
                item_count: itemRows.length
            }
        });
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error("ROLLBACK ERROR:", rollbackError);
        }

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "Dữ liệu vừa được cập nhật, vui lòng thử lại."
            });
        }

        console.error("SAVE PRESCRIPTION ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể lưu đơn thuốc."
        });
    } finally {
        connection.release();
    }
}

function createPrescription(req, res) {
    return savePrescription(req, res, false);
}

function updatePrescription(req, res) {
    return savePrescription(req, res, true);
}

// =====================================================
// XEM ĐƠN THUỐC CỦA MỘT LỊCH KHÁM
//
// GET /api/appointments/:id/prescription
// - Bệnh nhân: chỉ lịch của mình
// - Bác sĩ: chỉ lịch của mình
// - Admin: xem tất cả
// Chưa có đơn -> 200 với prescription = null
// =====================================================

async function getAppointmentPrescription(req, res) {
    try {
        const user = getCurrentUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Bạn chưa đăng nhập."
            });
        }

        const appointmentId = Number(req.params.id);

        if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
            return res.status(400).json({
                success: false,
                message: "ID lịch khám không hợp lệ."
            });
        }

        const [appointments] = await pool.query(
            `
            SELECT
                a.id,
                a.patient_id,
                a.doctor_id,
                a.status,
                a.appointment_time,
                s.schedule_date,
                pu.full_name AS patient_name,
                du.full_name AS doctor_name,
                sp.name AS specialty_name
            FROM appointments a
            INNER JOIN schedules s ON s.id = a.schedule_id
            INNER JOIN users pu ON pu.id = a.patient_id
            INNER JOIN doctors d ON d.id = a.doctor_id
            INNER JOIN users du ON du.id = d.user_id
            LEFT JOIN specialties sp ON sp.id = d.specialty_id
            WHERE a.id = ?
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

        if (user.role === "PATIENT") {
            if (Number(appointment.patient_id) !== Number(user.id)) {
                return res.status(403).json({
                    success: false,
                    message: "Bạn không có quyền xem đơn thuốc này."
                });
            }
        } else if (user.role === "DOCTOR") {
            const doctorId = await getDoctorIdFromUser(user);

            if (
                !doctorId ||
                Number(appointment.doctor_id) !== Number(doctorId)
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Bạn không có quyền xem đơn thuốc này."
                });
            }
        } else if (user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền xem đơn thuốc."
            });
        }

        const [records] = await pool.query(
            `
            SELECT
                id, diagnosis, symptoms,
                examination_notes, treatment_plan
            FROM medical_records
            WHERE appointment_id = ?
            LIMIT 1
            `,
            [appointmentId]
        );

        const medicalRecord = records[0] || null;
        let prescription = null;

        if (medicalRecord) {
            const [prescriptions] = await pool.query(
                `
                SELECT id, prescription_date, note
                FROM prescriptions
                WHERE medical_record_id = ?
                ORDER BY id ASC
                LIMIT 1
                `,
                [medicalRecord.id]
            );

            if (prescriptions.length > 0) {
                const [items] = await pool.query(
                    `
                    SELECT
                        id, medicine_name, dosage, frequency,
                        duration, quantity, instructions
                    FROM prescription_items
                    WHERE prescription_id = ?
                    ORDER BY id ASC
                    `,
                    [prescriptions[0].id]
                );

                prescription = { ...prescriptions[0], items };
            }
        }

        return res.json({
            success: true,
            data: {
                appointment: {
                    id: appointment.id,
                    status: appointment.status,
                    schedule_date: appointment.schedule_date,
                    appointment_time: appointment.appointment_time,
                    patient_name: appointment.patient_name,
                    doctor_name: appointment.doctor_name,
                    specialty_name: appointment.specialty_name
                },
                medical_record: medicalRecord,
                prescription
            }
        });
    } catch (error) {
        console.error("GET PRESCRIPTION ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể lấy đơn thuốc."
        });
    }
}

// =====================================================
// TẤT CẢ ĐƠN THUỐC CỦA BỆNH NHÂN ĐANG ĐĂNG NHẬP
//
// GET /api/prescriptions/my
//
// Mỗi phần tử gồm đầy đủ: thông tin khám (chẩn đoán, triệu chứng,
// ghi chú khám, hướng điều trị), bác sĩ, chuyên khoa, lời dặn
// và danh sách thuốc chi tiết (items).
// =====================================================

async function getMyPrescriptions(req, res) {
    try {
        const user = getCurrentUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Bạn chưa đăng nhập."
            });
        }

        if (user.role !== "PATIENT") {
            return res.status(403).json({
                success: false,
                message: "Chỉ bệnh nhân mới xem được đơn thuốc của mình."
            });
        }

        const [prescriptions] = await pool.query(
            `
            SELECT
                p.id AS prescription_id,
                p.prescription_date,
                p.note AS prescription_note,
                p.created_at AS prescription_created_at,
                mr.id AS medical_record_id,
                mr.diagnosis,
                mr.symptoms,
                mr.examination_notes,
                mr.treatment_plan,
                a.id AS appointment_id,
                a.appointment_time,
                a.status AS appointment_status,
                s.schedule_date,
                du.full_name AS doctor_name,
                sp.name AS specialty_name
            FROM prescriptions p
            INNER JOIN medical_records mr
                ON mr.id = p.medical_record_id
            INNER JOIN appointments a
                ON a.id = mr.appointment_id
            INNER JOIN schedules s
                ON s.id = a.schedule_id
            INNER JOIN doctors d
                ON d.id = a.doctor_id
            INNER JOIN users du
                ON du.id = d.user_id
            LEFT JOIN specialties sp
                ON sp.id = d.specialty_id
            WHERE a.patient_id = ?
            ORDER BY
                s.schedule_date DESC,
                a.appointment_time DESC,
                p.id DESC
            `,
            [user.id]
        );

        if (prescriptions.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const [items] = await pool.query(
            `
            SELECT
                id,
                prescription_id,
                medicine_name,
                dosage,
                frequency,
                duration,
                quantity,
                instructions
            FROM prescription_items
            WHERE prescription_id IN (?)
            ORDER BY id ASC
            `,
            [prescriptions.map(row => row.prescription_id)]
        );

        const itemsByPrescription = new Map();

        items.forEach(item => {
            const key = Number(item.prescription_id);

            if (!itemsByPrescription.has(key)) {
                itemsByPrescription.set(key, []);
            }

            itemsByPrescription.get(key).push(item);
        });

        const data = prescriptions.map(row => ({
            ...row,
            items: itemsByPrescription.get(Number(row.prescription_id)) || []
        }));

        return res.json({ success: true, data });
    } catch (error) {
        console.error("GET MY PRESCRIPTIONS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể lấy danh sách đơn thuốc."
        });
    }
}

module.exports = {
    createPrescription,
    updatePrescription,
    getAppointmentPrescription,
    getMyPrescriptions
};