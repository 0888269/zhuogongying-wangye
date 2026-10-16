'use strict';
const genders=['','男','女'];
function avatar(value){
    if(!value)return '/avatar.svg';
    try{const url=new URL(value);if(url.hostname==='trae-api-cn.mchost.guru' && url.pathname==='/api/ide/v1/text_to_image' && url.searchParams.get('prompt')==='default avatar')return '/avatar.svg';}catch{}
    return value;
}
function normalize(user){user.avatar=avatar(user.avatar);user.gender=genders.includes(user.gender)?user.gender:'';return user;}
async function initialize(query){const qr=await query("SHOW COLUMNS FROM users LIKE 'wechat_qr'");if(!qr.length)await query("ALTER TABLE users ADD COLUMN wechat_qr MEDIUMTEXT NULL");const columns=await query("SHOW COLUMNS FROM users LIKE 'gender'");if(!columns.length)await query("ALTER TABLE users ADD COLUMN gender VARCHAR(10) NOT NULL DEFAULT ''");}
module.exports={genders,avatar,normalize,initialize};
