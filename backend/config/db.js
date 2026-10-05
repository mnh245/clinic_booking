const mysql=require("mysql2/promise");
require("dotenv").config();
const pool=mysql.createPool({
    host:process.env.DB_HOST||"localhost",
    port:Number(process.env.DB_PORT)||3306,
    user:process.env.DB_USER||"root",
    password:process.env.DB_PASSWORD||"_Hieu552004",
    database:process.env.DB_NAME||"clinic_booking",
    waitForConnections:true,
    connectionLimit:10,
    queueLimit:0
});
async function testConnection(){
    try{
        const connection=await pool.getConnection();
        console.log("MySQL connected successfully.");
        connection.release();
    }catch(error){
        console.error("MySQL connection error:",error.message);
        throw error;
    }
}
module.exports={pool,testConnection};