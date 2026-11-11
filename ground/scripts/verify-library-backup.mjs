import { verifyLibraryBackup } from './library-backup.mjs';
try {
  if(process.argv.length!==3)throw new Error('Usage: node verify-library-backup.mjs BACKUP_DIRECTORY');
  const manifest=await verifyLibraryBackup(process.argv[2]);
  console.log(`Library backup verified: ${manifest.backupId} (${manifest.files.length} originals, ${manifest.snapshot.versions.length} versions)`);
} catch(error) {console.error(error.message);process.exitCode=1;}
