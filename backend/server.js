const express=require("express");
const path=require("path");
require("dotenv").config();
const {testConnection}=require("./config/db");
const authRoutes=require("./routes/auth.routes");
const app=express();
const doctorRoutes = require("./routes/doctor.routes");
const appointmentRoutes = require("./routes/appointment.routes");
const scheduleRoutes = require("./routes/schedule.routes");
const PORT=process.env.PORT||3000;
const frontendPath=path.join(__dirname,"..","frontend");
app.use(express.json());
app.use("/api", authRoutes);
app.use("/api/doctors", doctorRoutes);
app.use(express.urlencoded({extended:true}));
app.use("/api",authRoutes);
app.use(
    "/api",
    scheduleRoutes
);
app.use(
    "/api",
    appointmentRoutes
);
app.use(express.static(frontendPath));
app.get("/",(req,res)=>{
    res.redirect("/login.html");
});
app.use((req,res,next)=>{
    if(req.path.startsWith("/api/")){
        return res.status(404).json({
            success:false,
            message:"API không tồn tại."
        });
    }
    res.status(404).send("Trang không tồn tại.");
});
app.use((error,req,res,next)=>{
    console.error("SERVER ERROR:",error);
    res.status(500).json({
        success:false,
        message:"Lỗi máy chủ."
    });
});
async function startServer(){
    try{
        await testConnection();
        app.listen(PORT,()=>{
            console.log(`Server running at http://localhost:${PORT}`);
            console.log(`Login page: http://localhost:${PORT}/login.html`);
            console.log(`Register page: http://localhost:${PORT}/register.html`);
        });
    }catch(error){
        console.error("Server cannot start:",error.message);
        process.exit(1);
    }
}
startServer();