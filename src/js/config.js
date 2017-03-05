/**
 * @file Factual Config
 * @name Factual
 *
 * Factual extension config code.
 *
 * @author Alexandru Badiu <andu@ctrlz.ro>
 */

export default {
  pluginId: 'factual',
  api: 'http://demagog.local/api/v1',
  updateFullCachePeriodInMinutes: false, // don't update; 60 * 24 - a day
  updateSourcesCachePeriodInMinutes: 5, // 5 minutes
};
