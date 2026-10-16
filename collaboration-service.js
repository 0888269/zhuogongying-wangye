'use strict';
const defaults={documents:'https://dcnjoonwslf3.feishu.cn/drive/home/',attendance:'',approval:''};
function valid(value){if(value==='')return true;try{const u=new URL(value);return value.length<2000&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['feishu.cn','larksuite.com'].some(domain=>u.hostname===domain||u.hostname.endsWith('.'+domain));}catch{return false;}}
function create(query){
 async function initialize(){await query('CREATE TABLE IF NOT EXISTS collaboration_settings (id TINYINT PRIMARY KEY, value TEXT NOT NULL)');}
 async function settings(){const rows=await query('SELECT value FROM collaboration_settings WHERE id = 1');return rows.length?{...defaults,...JSON.parse(rows[0].value)}:{...defaults};}
 function register(app){app.get('/api/public/collaboration',async(req,res)=>{try{const data=await settings();res.json({success:true,settings:{documents:data.documents}});}catch{res.status(500).json({success:false,message:'协作入口暂时不可用'});}});for(const route of ['/api/collaboration','/api/admin/collaboration'])app.get(route,async(req,res)=>{try{res.json({success:true,settings:await settings()});}catch{res.status(500).json({success:false,message:'协作入口暂时不可用'});}});
 app.put('/api/admin/collaboration',async(req,res)=>{const data={};for(const key of Object.keys(defaults)){const value=req.body[key];if(typeof value!=='string'||!valid(value.trim()))return res.status(400).json({success:false,message:'请填写 HTTPS 飞书链接，或留空隐藏入口'});data[key]=value.trim();}try{await query('INSERT INTO collaboration_settings (id, value) VALUES (1, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',[JSON.stringify(data)]);res.json({success:true,settings:data});}catch{res.status(500).json({success:false,message:'协作入口保存失败'});}});
 }
 return {initialize,register};
}
module.exports={create,valid};
