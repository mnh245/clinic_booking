async function apiFetch(url,options={}){
    const config={
        ...options,
        headers:{
            "Content-Type":"application/json",
            ...(options.headers||{})
        }
    };
    try{
        const response=await fetch(url,config);
        const contentType=response.headers.get("content-type")||"";
        const data=contentType.includes("application/json")
            ?await response.json()
            :await response.text();
        if(!response.ok){
            const message=
                typeof data==="object"&&data.message
                ?data.message
                :`API trả về lỗi ${response.status}`;
            throw new Error(message);
        }
        return data;
    }catch(error){
        console.error("API ERROR:",error);
        if(error instanceof TypeError){
            throw new Error("Không thể kết nối đến máy chủ.");
        }
        throw error;
    }
}