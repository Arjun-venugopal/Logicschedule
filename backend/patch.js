const fs = require('fs');

const files = [
  'controllers/studentController.ts',
  'controllers/batchController.ts',
  'controllers/scheduleController.ts',
  'controllers/teacherController.ts'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/req\.params\.id(?!\s+as\s+string)/g, 'req.params.id as string');
  content = content.replace(/b => b\._id/g, '(b: any) => b._id');
  content = content.replace(/deletedCount/g, 'length');
  content = content.replace(/s => \(\{/g, '(s: any) => ({');
  content = content.replace(/stu => stu\._id \|\| stu/g, '(stu: any) => stu._id || stu');
  content = content.replace(/async cls =>/g, 'async (cls: any) =>');
  content = content.replace(/a => \(\{/g, '(a: any) => ({');
  fs.writeFileSync(f, content);
});
console.log('Patched TS errors');
