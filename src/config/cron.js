import cron from 'node-cron';
import { emptyTrashCronJob } from '../controller/restoreController';

/**
 * Setup cron job for automatic trash cleanup
 * Deletes items older than 30 days from trash
 */
export const setupTrashCleanupCron = () => {
  // Run every day at 2:00 AM
  // Cron expression: '0 2 * * *'
  // Format: minute hour day month weekday
  
  cron.schedule('0 2 * * *', async () => {
    console.log('🗑️  Running trash cleanup cron job...');
    
    try {
      const result = await emptyTrashCronJob();
      
      if (result.success) {
        console.log(`✅ Trash cleanup completed successfully`);
        console.log(`   - Deleted ${result.deleted.folders} folders`);
        console.log(`   - Deleted ${result.deleted.documents} documents`);
      } else {
        console.error('❌ Trash cleanup failed:', result.error);
      }
    } catch (error) {
      console.error('❌ Error running trash cleanup:', error);
    }
  }, {
    timezone: 'Asia/Kolkata' // Change to your timezone
  });

  console.log('✅ Trash cleanup cron job scheduled (runs daily at 2:00 AM)');
};

// Alternative schedule options:
// Every hour: '0 * * * *'
// Every 6 hours: '0 */6 * * *'
// Every day at midnight: '0 0 * * *'
// Every week on Sunday at 3:00 AM: '0 3 * * 0'
// Every month on 1st at 1:00 AM: '0 1 1 * *'