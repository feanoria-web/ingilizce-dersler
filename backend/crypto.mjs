const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), n => n.toString(16).padStart(2,'0')).join('');
const unhex = s => Uint8Array.from(s.match(/../g) || [], x => parseInt(x,16));
export function normalizeName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[ıİ]/g,'i').toLowerCase().replace(/[^a-z0-9]/g,'');
}
export const digest = async s => hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
export const newToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function passwordHash(password, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  // Workers currently caps one PBKDF2 operation at 100,000 iterations.
  const hash = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:unhex(salt)},key,256);
  return `pbkdf2:100000:${salt}:${hex(hash)}`;
}
export async function verifyPassword(password, stored) {
  if (!/^pbkdf2:100000:[a-f0-9]{32}:[a-f0-9]{64}$/.test(stored || '')) return false;
  const calculated = await passwordHash(password,stored.split(':')[2]);
  let diff = 0;
  for (let i=0; i<calculated.length; i++) diff |= calculated.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}
export function aliasesFor(student) {
  const parts = student.name.trim().split(/\s+/);
  const candidates = [student.name,parts[0],parts.slice(0,-1).join(' '),...(student.aliases || [])];
  return [...new Set(candidates.map(normalizeName).filter(x => x.length >= 2))];
}
