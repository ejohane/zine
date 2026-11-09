import { archiveBackup } from './backup-storage';
if (!process.argv[2]) throw new Error('Supply an ignored backup directory');
console.log(JSON.stringify(await archiveBackup(process.argv[2])));
