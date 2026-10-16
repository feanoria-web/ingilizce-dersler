// Internal handoff helper: receive one JSON line on a pipe; never echo input.
import readline from 'node:readline';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const reader=readline.createInterface({input:process.stdin,terminal:false});
console.log('Ready for private setup input.');
reader.once('line',async line=>{reader.close();if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();try {
  const data=JSON.parse(line),origin='http://127.0.0.1:8787';
  const r=await fetch(origin+'/api/admin/setup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({newPassword:data.password})});
  const result=await r.json();if(!r.ok)throw new Error(result.error);
  console.log('Yönetici şifresi kuruldu; şifrenin kendisi saklanmadı.');
}catch(e){console.error(e.message);process.exitCode=1;}});
