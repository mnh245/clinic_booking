const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
// =====================================================
// ĐĂNG KÝ
// =====================================================
async function register(req, res) {
    try {
        const {
            full_name,
            email,
            password,
            phone
        } = req.body;
        // Kiểm tra dữ liệu bắt buộc
        if (!full_name || !email || !password) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập đầy đủ họ tên, email và mật khẩu."
            });
        }
        // Làm sạch dữ liệu
        const cleanName = full_name.trim();
        const cleanEmail =
            email.trim().toLowerCase();
        const cleanPhone =
            phone ? phone.trim() : null;
        // Kiểm tra họ tên
        if (cleanName.length < 2) {
            return res.status(400).json({
                success: false,
                message:
                    "Họ và tên phải có ít nhất 2 ký tự."
            });
        }
        // Kiểm tra email
        if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                cleanEmail
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Email không hợp lệ."
            });
        }
        // Kiểm tra mật khẩu
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message:
                    "Mật khẩu phải có ít nhất 8 ký tự."
            });
        }
        // Kiểm tra email đã tồn tại
        const [existingUsers] =
            await pool.execute(
                `
                SELECT id
                FROM users
                WHERE email = ?
                LIMIT 1
                `,
                [cleanEmail]
            );
        if (existingUsers.length > 0) {
            return res.status(409).json({
                success: false,
                message:
                    "Email này đã được đăng ký."
            });
        }
        // Mã hóa mật khẩu
        const hashedPassword =
            await bcrypt.hash(password, 10);
        // Lưu tài khoản
        const [result] =
            await pool.execute(
                `
                INSERT INTO users
                (
                    full_name,
                    email,
                    password,
                    phone,
                    role
                )
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    cleanName,
                    cleanEmail,
                    hashedPassword,
                    cleanPhone,
                    "PATIENT"
                ]
            );
        return res.status(201).json({
            success: true,
            message:
                "Đăng ký tài khoản thành công.",
            user: {
                id: result.insertId,
                full_name: cleanName,
                email: cleanEmail,
                phone: cleanPhone,
                role: "PATIENT"
            }
        });
    } catch (error) {
        console.error(
            "REGISTER ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Lỗi máy chủ khi đăng ký tài khoản."
        });
    }
}
// =====================================================
// ĐĂNG NHẬP
// =====================================================
async function login(req, res) {
    try {
        const {
            email,
            password
        } = req.body;
        // Kiểm tra dữ liệu
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập email và mật khẩu."
            });
        }
        // Chuẩn hóa email
        const cleanEmail =
            email.trim().toLowerCase();
        // Tìm tài khoản
        const [users] =
            await pool.execute(
                `
                SELECT
                    id,
                    full_name,
                    email,
                    password,
                    phone,
                    gender,
                    date_of_birth,
                    role,
                    created_at,
                    updated_at
                FROM users
                WHERE email = ?
                LIMIT 1
                `,
                [cleanEmail]
            );
        // Không tìm thấy tài khoản
        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message:
                    "Email hoặc mật khẩu không chính xác."
            });
        }
        const user = users[0];
        // Kiểm tra mật khẩu
        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password
            );
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message:
                    "Email hoặc mật khẩu không chính xác."
            });
        }
        // =================================================
        // TẠO SESSION
        // =================================================
        const sessionUser = {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone,
            gender: user.gender,
            date_of_birth: user.date_of_birth,
            role: user.role,
            created_at: user.created_at,
            updated_at: user.updated_at
        };
        /*
         * Tạo session mới sau khi đăng nhập thành công.
         *
         * Việc regenerate session giúp tránh
         * session fixation.
         */
        req.session.regenerate((sessionError) => {
            if (sessionError) {
                console.error(
                    "SESSION REGENERATE ERROR:",
                    sessionError
                );
                return res.status(500).json({
                    success: false,
                    message:
                        "Không thể tạo phiên đăng nhập."
                });
            }
            // Lưu thông tin user vào session
            req.session.user = sessionUser;
            console.log("SESSION ID AFTER LOGIN:", req.sessionID);
            console.log("SESSION USER AFTER LOGIN:", req.session.user);
            // Lưu session
            req.session.save((saveError) => {
                if (saveError) {
                    console.error(
                        "SESSION SAVE ERROR:",
                        saveError
                    );
                    return res.status(500).json({
                        success: false,
                        message:
                            "Không thể lưu phiên đăng nhập."
                    });
                }
                console.log(
                    `SESSION LOGIN: ${sessionUser.email} | ROLE: ${sessionUser.role}`
                );
                return res.status(200).json({
                    success: true,
                    message:
                        "Đăng nhập thành công.",
                    user: sessionUser
                });
            });
        });
    } catch (error) {
        console.error(
            "LOGIN ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Lỗi máy chủ khi đăng nhập tài khoản."
        });
    }
}
// =====================================================
// ĐĂNG XUẤT
// =====================================================
function logout(req, res) {
    if (!req.session) {
        return res.status(200).json({
            success: true,
            message:
                "Đã đăng xuất."
        });
    }
    req.session.destroy((error) => {
        if (error) {
            console.error(
                "LOGOUT ERROR:",
                error
            );
            return res.status(500).json({
                success: false,
                message:
                    "Không thể đăng xuất."
            });
        }
        // Xóa cookie session
        res.clearCookie("connect.sid");
        return res.status(200).json({
            success: true,
            message:
                "Đăng xuất thành công."
        });
    });
}
// =====================================================
// EXPORT
// =====================================================
module.exports = {
    register,
    login,
    logout
};