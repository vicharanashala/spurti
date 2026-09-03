import mongoose from 'mongoose';

/**
 * ResourceExchangeConfig — tier 8.
 *
 * Persistent server-side toggle for the entire Resource Exchange feature.
 * One document in the `resourceexchangeconfigs` collection. Reads are
 * cached in-process for one minute; writes invalidate the cache and emit
 * an audit row (handled by services/featureControl).
 *
 * ponytail: one-minute cache is the deliberate ceiling. Toggle latency
 * is "feel instant to the admin", not "instant to every request". When
 * admin disables, all student requests within ~60s of the toggle might
 * still see enabled=true. If we ever care about stronger consistency,
 * drop the cache and read from Mongo per-request.
 *
 * Default: enabled=true. Existing deployments that have no row in this
 * collection behave as if it were enabled, so the toggle is opt-in.
 */
const resourceExchangeConfigSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true, required: true },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: '' }
}, { timestamps: false, collection: 'resourceexchangeconfigs' });

export default mongoose.model('ResourceExchangeConfig', resourceExchangeConfigSchema);
