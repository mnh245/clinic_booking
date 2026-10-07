const bcrypt=require("bcryptjs");
const {pool}=require("../config/db");
async function register(req,res){
    try{
        const {full_name,email,password,phone}=req.body;
        if(!full_name||!email||!password){
            return res.status(400).json({
                success:false,
                message:"Vui lòng nhập đầy đủ họ tên, email và mật khẩu."
            });
        }
        const cleanName=full_name.trim();
        const cleanEmail=email.trim().toLowerCase();
        const cleanPhone=phone?phone.trim():null;
        if(cleanName.length<2){
            return res.status(400).json({
                success:false,
                message:"Họ và tên phải có ít nhất 2 ký tự."
            });
        }
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)){
            return res.status(400).json({
                success:false,
                message:"Email không hợp lệ."
            });
        }
        if(password.length<8){
            return res.status(400).json({
                success:false,
                message:"Mật khẩu phải có ít nhất 8 ký tự."
            });
        }
        const [existingUsers]=await pool.execute(
            "SELECT id FROM users WHERE email=? LIMIT 1",
            [cleanEmail]
        );
        if(existingUsers.length>0){
            return res.status(409).json({
                success:false,
                message:"Email này đã được đăng ký."
            });
        }
        const hashedPassword=await bcrypt.hash(password,10);
        const [result]=await pool.execute(
            `INSERT INTO users
            (full_name,email,password,phone,role)
            VALUES(?,?,?,?,?)`,
            [
                cleanName,
                cleanEmail,
                hashedPassword,
                cleanPhone,
                "PATIENT"
            ]
        );
        return res.status(201).json({
            success:true,
            message:"Đăng ký tài khoản thành công.",
            user:{
                id:result.insertId,
                full_name:cleanName,
                email:cleanEmail,
                phone:cleanPhone,
                role:"PATIENT"
            }
        });
    }catch(error){
        console.error("REGISTER ERROR:",error);
        return res.status(500).json({
            success:false,
            message:"Lỗi máy chủ khi đăng ký tài khoản."
        });
    }
}
async function login(req,res){
    try{
        const {email,password}=req.body;
        if(!email||!password){
            return res.status(400).json({
                success:false,
                message:"Vui lòng nhập email và mật khẩu."
            });
        }
        const cleanEmail=email.trim().toLowerCase();
        const [users]=await pool.execute(
            `SELECT
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
            WHERE email=?
            LIMIT 1`,
            [cleanEmail]
        );
        if(users.length===0){
            return res.status(401).json({
                success:false,
                message:"Email hoặc mật khẩu không chính xác."
            });
        }
        const user=users[0];
        const passwordMatch=await bcrypt.compare(
            password,
            user.password
        );
        if(!passwordMatch){
            return res.status(401).json({
                success:false,
                message:"Email hoặc mật khẩu không chính xác."
            });
        }
        delete user.password;
        return res.status(200).json({
            success:true,
            message:"Đăng nhập thành công.",
            user:user
        });
    }catch(error){
        console.error("LOGIN ERROR:",error);
        return res.status(500).json({
            success:false,
            message:"Lỗi máy chủ khi đăng nhập."
        });
    }
}
module.exports={
    register,
    login
};