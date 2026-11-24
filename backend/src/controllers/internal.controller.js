import { jobStore, executeBulkProvisioning, generateMasterCsvFiles } from '../services/bulkSeeder.service.js';

/**
 * Security Guard: Validates that either x-internal-seed-key matches BOOTSTRAP_SECRET
 * or caller has Super Admin JWT credentials
 */
export function verifyInternalSeedKey(req, res, next) {
  const seedKey = req.headers['x-internal-seed-key'];
  const expectedKey = process.env.BOOTSTRAP_SECRET || 'RLJIT_SUPER_MASTERMIND_BOOTSTRAP_KEY_2026';

  if (seedKey && seedKey === expectedKey) {
    return next();
  }

  // Also allow authenticated Super Admin
  if (req.user && (req.user.adminTier === 'SUPER_ADMIN' || req.user.admin_tier === 'SUPER_ADMIN')) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'Forbidden: x-internal-seed-key header required or Super Admin JWT token',
  });
}

/**
 * POST /api/v1/internal/bulk-provision
 * Triggers master CSV generation, loopback API provisioning (10 concurrency pool),
 * and credentials export to /credentials/
 */
export async function triggerBulkProvision(req, res) {
  try {
    const port = process.env.PORT || 5000;
    const jobId = `job_seed_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Optional sync CSV pre-generation if requested
    if (req.query.csv_only === 'true') {
      const meta = await generateMasterCsvFiles();
      return res.status(200).json({
        success: true,
        message: 'Master CSV files successfully generated in backend/seed_data/',
        metadata: meta,
      });
    }

    const job = await executeBulkProvisioning(jobId, port);

    return res.status(202).json({
      success: true,
      message: 'Internal bulk provisioning job initiated successfully in background',
      jobId,
      statusEndpoint: `/api/v1/internal/bulk-provision/status/${jobId}`,
      initialStatus: job.status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('triggerBulkProvision error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to trigger bulk provisioning' });
  }
}

/**
 * GET /api/v1/internal/bulk-provision/status/:jobId
 * Returns live progress, counts, errors, CSV paths, and /credentials/ export paths
 */
export async function getBulkProvisionStatus(req, res) {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: `Bulk provisioning job '${jobId}' not found`,
    });
  }

  return res.status(200).json({
    success: true,
    job,
  });
}

export default {
  verifyInternalSeedKey,
  triggerBulkProvision,
  getBulkProvisionStatus,
};
