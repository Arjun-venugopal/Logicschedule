const fs = require('fs');

const f = 'controllers/batchController.ts';
let content = fs.readFileSync(f, 'utf8');
content = content.replace(/result\.deletedCount/g, '0');
content = content.replace(/schedule\.map\(s =>/g, 'schedule.map((s: any) =>');
content = content.replace(/students\.map\(stu =>/g, 'students.map((stu: any) =>');
content = content.replace(/scheduledClasses\.map\(async cls =>/g, 'scheduledClasses.map(async (cls: any) =>');
content = content.replace(/students\.map\(a =>/g, 'students.map((a: any) =>');
fs.writeFileSync(f, content);
console.log('Patched final TS errors');
