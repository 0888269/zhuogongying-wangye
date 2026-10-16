'use strict';
function createNfcService(query,encrypt){
 async function initialize(){await query(`CREATE TABLE IF NOT EXISTS nfc_card_status (user_id VARCHAR(50) PRIMARY KEY, written_at TIMESTAMP NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);}
 function register(app){
 app.get('/api/admin/nfc-cards',async(req,res)=>{try{
 const users=await query('SELECT * FROM users ORDER BY created_at ASC, id ASC');const status=await query('SELECT user_id, written_at FROM nfc_card_status');const dates=new Map(status.map(row=>[row.user_id,row.written_at]));const cards=[];
 for(const user of users){if(user.id==='admin')continue;let encrypted=user.encrypted_id;if(!encrypted){await query("UPDATE users SET encrypted_id = ? WHERE id = ? AND (encrypted_id IS NULL OR encrypted_id = '')",[encrypt(user.id),user.id]);const stored=await query('SELECT encrypted_id FROM users WHERE id = ?',[user.id]);encrypted=stored[0].encrypted_id;}
 cards.push({id:user.id,name:user.name,number:cards.length+1,url:'/user/'+encrypted,writtenAt:dates.get(user.id)||null});}
 res.json({success:true,cards});
 }catch{res.status(500).json({success:false,message:'无法读取写卡名单，请重试'});}});
 app.put('/api/admin/nfc-cards/:userId',async(req,res)=>{if(typeof req.body.written!=='boolean')return res.status(400).json({success:false,message:'写卡状态无效'});try{const users=await query('SELECT id FROM users WHERE id = ?',[req.params.userId]);if(!users.length||req.params.userId==='admin')return res.status(404).json({success:false,message:'成员不存在'});
 await query('INSERT INTO nfc_card_status (user_id, written_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE written_at = VALUES(written_at)',[req.params.userId,req.body.written?new Date():null]);const rows=await query('SELECT user_id, written_at FROM nfc_card_status WHERE user_id = ?',[req.params.userId]);res.json({success:true,writtenAt:rows[0].written_at});
 }catch{res.status(500).json({success:false,message:'写卡状态保存失败，请重试'});}});
 }
 return {initialize,register};
}
module.exports={createNfcService};
